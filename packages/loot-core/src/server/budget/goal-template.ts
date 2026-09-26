import { aqlQuery } from '#server/aql';
import * as db from '#server/db';
import { batchMessages } from '#server/sync';
// @ts-strict-ignore
import * as monthUtils from '#shared/months';
import { q } from '#shared/query';
import type { CategoryEntity, CategoryGroupEntity } from '#types/models';
import type { CleanupTemplate } from '#types/models/cleanup-templates';
import type { Template } from '#types/models/templates';

import { getSheetValue, isTrackingBudget, setBudget, setGoal } from './actions';
import { CategoryTemplateContext } from './category-template-context';
import { tombstoneOrphanCleanupGroups } from './cleanup-groups';
import { getCategoriesWithTemplateNotes } from './statements';
import {
  checkTemplateNotes,
  getCategoriesWithTemplates,
  getEditableTemplateAmounts,
  isTemplateLine,
  setEditableTemplateAmount,
  storeNoteTemplates,
  unparse,
} from './template-notes';
import type { TemplateNotification } from './template-notification';

export function distributeRemainder(
  templateContexts: CategoryTemplateContext[],
  availBudget: number,
): number {
  let remainderContexts = templateContexts.filter(c => c.hasRemainder());
  while (availBudget > 0 && remainderContexts.length > 0) {
    let remainderWeight = 0;
    remainderContexts.forEach(
      context => (remainderWeight += context.getRemainderWeight()),
    );
    const perWeight = availBudget / remainderWeight;
    const beforePass = availBudget;
    remainderContexts.forEach(context => {
      availBudget -= context.runRemainder(availBudget, perWeight);
    });
    if (availBudget === beforePass) break;
    remainderContexts = templateContexts.filter(c => c.hasRemainder());
  }
  return availBudget;
}

export async function storeTemplates({
  categoriesWithTemplates,
  source,
}: {
  categoriesWithTemplates: {
    id: string;
    templates: Template[];
    cleanup?: CleanupTemplate[];
  }[];
  source: 'notes' | 'ui';
}): Promise<void> {
  let touchedCleanup = false;
  await batchMessages(async () => {
    for (const { id, templates, cleanup } of categoriesWithTemplates) {
      const goalDefs = templates.length > 0 ? JSON.stringify(templates) : null;
      const update: Record<string, unknown> = {
        id,
        goal_def: goalDefs,
        template_settings: { source },
      };
      if (cleanup !== undefined) {
        update.cleanup_def =
          cleanup.length > 0 ? JSON.stringify(cleanup) : null;
        touchedCleanup = true;
      }
      await db.updateWithSchema('categories', update);
    }
  });
  if (touchedCleanup) {
    await tombstoneOrphanCleanupGroups();
  }
}

export async function applyTemplate({
  month,
}: {
  month: string;
}): Promise<TemplateNotification> {
  await storeNoteTemplates();
  const categoryTemplates = await getTemplates();
  const ret = await processTemplate(month, false, categoryTemplates, []);
  return ret;
}

export async function overwriteTemplate({
  month,
}: {
  month: string;
}): Promise<TemplateNotification> {
  await storeNoteTemplates();
  const categoryTemplates = await getTemplates();
  const ret = await processTemplate(month, true, categoryTemplates, []);
  return ret;
}

export async function applyMultipleCategoryTemplates({
  month,
  categoryIds,
}: {
  month: string;
  categoryIds: Array<CategoryEntity['id']>;
}) {
  const { data: categoryData }: { data: CategoryEntity[] } = await aqlQuery(
    q('categories')
      .filter({ id: { $oneof: categoryIds } })
      .select('*'),
  );
  await storeNoteTemplates();
  const categoryTemplates = await getTemplates(c => categoryIds.includes(c.id));
  const ret = await processTemplate(
    month,
    true,
    categoryTemplates,
    categoryData,
  );
  return ret;
}

export async function applySingleCategoryTemplate({
  month,
  category,
}: {
  month: string;
  category: CategoryEntity['id'];
}) {
  const { data: categoryData }: { data: CategoryEntity[] } = await aqlQuery(
    q('categories').filter({ id: category }).select('*'),
  );
  await storeNoteTemplates();
  const categoryTemplates = await getTemplates(c => c.id === category);
  const ret = await processTemplate(
    month,
    true,
    categoryTemplates,
    categoryData,
  );
  return ret;
}

export function runCheckTemplates() {
  return checkTemplateNotes();
}

async function getCategories(): Promise<CategoryEntity[]> {
  const { data: categoryGroups }: { data: CategoryGroupEntity[] } =
    await aqlQuery(q('category_groups').filter({ hidden: false }).select('*'));

  return categoryGroups.flatMap(g => g.categories || []).filter(c => !c.hidden);
}

async function getTemplates(
  filter: (category: CategoryEntity) => boolean = () => true,
): Promise<Record<CategoryEntity['id'], Template[]>> {
  //retrieves template definitions from the database
  const { data: categoriesWithGoalDef }: { data: CategoryEntity[] } =
    await aqlQuery(
      q('categories')
        .filter({ goal_def: { $ne: null } })
        .select('*'),
    );

  const categoryTemplates: Record<CategoryEntity['id'], Template[]> = {};
  for (const categoryWithGoalDef of categoriesWithGoalDef.filter(filter)) {
    if (!categoryWithGoalDef.goal_def) continue;
    categoryTemplates[categoryWithGoalDef.id] = JSON.parse(
      categoryWithGoalDef.goal_def,
    );
  }
  return categoryTemplates;
}

export async function getTemplatesForCategory(
  categoryId: CategoryEntity['id'],
): Promise<Record<CategoryEntity['id'], Template[]>> {
  return getTemplates(c => c.id === categoryId);
}

type TemplateBudget = {
  category: CategoryEntity['id'];
  budgeted: number;
};

async function setBudgets(month: string, templateBudget: TemplateBudget[]) {
  await batchMessages(async () => {
    templateBudget.forEach(element => {
      void setBudget({
        category: element.category,
        month,
        amount: element.budgeted,
      });
    });
  });
}

type TemplateGoal = {
  category: CategoryEntity['id'];
  goal: number | null;
  longGoal: number | null;
};

async function setGoals(month: string, templateGoal: TemplateGoal[]) {
  await batchMessages(async () => {
    templateGoal.forEach(element => {
      void setGoal({
        month,
        category: element.category,
        goal: element.goal,
        long_goal: element.longGoal,
      });
    });
  });
}

type ComputedTemplates = {
  contexts: CategoryTemplateContext[];
  errors: string[];
  orphanGoals: TemplateGoal[];
};

async function computeTemplates(
  month: string,
  force: boolean,
  categoryTemplates: Record<CategoryEntity['id'], Template[]>,
  categories: CategoryEntity[] = [],
  skipAvailableClamp: boolean = false,
): Promise<ComputedTemplates> {
  // setup categories
  const isTracking = isTrackingBudget();
  if (!categories.length) {
    categories = (await getCategories()).filter(
      c => isTracking || !c.is_income,
    );
  }

  // setup categories to process
  const templateContexts: CategoryTemplateContext[] = [];
  let availBudget = await getSheetValue(
    monthUtils.sheetForMonth(month),
    isTracking ? `total-saved` : `to-budget`,
  );
  const prioritiesSet = new Set<number>();
  const errors: string[] = [];
  const orphanGoals: TemplateGoal[] = [];
  for (const category of categories) {
    const { id } = category;
    const sheetName = monthUtils.sheetForMonth(month);
    const templates = categoryTemplates[id];
    const budgeted = await getSheetValue(sheetName, `budget-${id}`);
    const existingGoal = await getSheetValue(sheetName, `goal-${id}`);

    // only run categories that are unbudgeted or if we are forcing it
    if ((budgeted === 0 || force) && templates) {
      try {
        const templateContext = await CategoryTemplateContext.init(
          templates,
          category,
          month,
          budgeted,
          skipAvailableClamp,
        );
        // don't use the funds that are not from templates
        if (!templateContext.isGoalOnly()) {
          availBudget += budgeted;
        }
        availBudget += templateContext.getLimitExcess();
        templateContext.getPriorities().forEach(p => prioritiesSet.add(p));
        templateContexts.push(templateContext);
      } catch (e) {
        errors.push(`${category.name}: ${e.message}`);
      }

      // do a reset of the goals that are orphaned
    } else if (existingGoal !== null && !templates) {
      orphanGoals.push({
        category: id,
        goal: null,
        longGoal: null,
      });
    }
  }

  if (errors.length > 0) {
    return { contexts: templateContexts, errors, orphanGoals };
  }

  const priorities = new Int32Array([...prioritiesSet]).sort((a, b) => a - b);
  // run each priority level
  for (const priority of priorities) {
    const availStart = availBudget;
    for (const templateContext of templateContexts) {
      const budget = await templateContext.runTemplatesForPriority(
        priority,
        availBudget,
        availStart,
      );
      availBudget -= budget;
    }
  }

  distributeRemainder(templateContexts, availBudget);

  return { contexts: templateContexts, errors, orphanGoals };
}

async function processTemplate(
  month: string,
  force: boolean,
  categoryTemplates: Record<CategoryEntity['id'], Template[]>,
  categories: CategoryEntity[] = [],
): Promise<TemplateNotification> {
  const { contexts, errors, orphanGoals } = await computeTemplates(
    month,
    force,
    categoryTemplates,
    categories,
  );

  if (contexts.length === 0 && errors.length === 0) {
    if (orphanGoals.length > 0) {
      await setGoals(month, orphanGoals);
    }
    return {
      type: 'message',
      message: 'templates-up-to-date',
    };
  }
  if (errors.length > 0) {
    return {
      sticky: true,
      message: 'template-errors',
      pre: errors.join(`\n\n`),
    };
  }

  const budgetList: TemplateBudget[] = [];
  const goalList: TemplateGoal[] = [...orphanGoals];
  contexts.forEach(context => {
    const values = context.getValues();
    budgetList.push({
      category: context.category.id,
      budgeted: values.budgeted,
    });
    goalList.push({
      category: context.category.id,
      goal: values.goal,
      longGoal: values.longGoal ? 1 : null,
    });
  });
  await setBudgets(month, budgetList);
  await setGoals(month, goalList);

  return {
    type: 'message',
    message: 'templates-applied',
    count: contexts.length,
  };
}

export type DryRunCategoryResult = {
  budgeted: number;
  perTemplate: number[];
};

export async function dryRunCategoryTemplate({
  month,
  categoryId,
  templates,
}: {
  month: string;
  categoryId: CategoryEntity['id'];
  templates: Template[];
}): Promise<DryRunCategoryResult> {
  // The projection answers "how much do these templates demand" — it
  // skips the priority clamp so future months (where To Budget is empty)
  // still show the templates' intended amount instead of 0.
  const { data: categoryData }: { data: CategoryEntity[] } = await aqlQuery(
    q('categories').filter({ id: categoryId }).select('*'),
  );
  if (categoryData.length === 0) {
    return { budgeted: 0, perTemplate: templates.map(() => 0) };
  }
  const { contexts } = await computeTemplates(
    month,
    true,
    { [categoryId]: templates },
    categoryData,
    true,
  );
  const ctx = contexts.find(c => c.category.id === categoryId);
  if (!ctx) return { budgeted: 0, perTemplate: templates.map(() => 0) };
  const values = ctx.getValues();
  return {
    budgeted: values.budgeted,
    perTemplate: templates.map(t => values.perTemplateContribution.get(t) ?? 0),
  };
}

export type TemplatePreviewLine = {
  label: string | null;
  templateText: string;
  requested: number;
  editableAmount: number | null;
  isRemainder: boolean;
};

export type TemplatePreviewCategory = {
  id: CategoryEntity['id'];
  budgeted: number;
  requested: number;
  // One entry per #template line, in note order, so an edit can address a
  // line by its index.
  lines: TemplatePreviewLine[];
};

export type TemplatePreview = {
  categories: TemplatePreviewCategory[];
  errors: string[];
};

// Shows what every category's templates ask for this month without writing
// anything. Templates are read straight from the notes so edits show up
// before they are applied, and the priority clamp is skipped so the amounts
// reflect the templates' full request rather than what To Budget can cover.
export async function previewTemplates({
  month,
}: {
  month: string;
}): Promise<TemplatePreview> {
  const noteTemplates = await getCategoriesWithTemplates();
  const categoryTemplates = await getTemplates(
    c => c.template_settings?.source === 'ui',
  );
  const errors: string[] = [];
  for (const { id, name, templates } of noteTemplates) {
    categoryTemplates[id] = templates;
    for (const template of templates) {
      if (template.type === 'error') {
        errors.push(`${name}: ${template.line.trim()}`);
      }
    }
  }

  const notesById = new Map(
    (await getCategoriesWithTemplateNotes()).map(({ id, note }) => [id, note]),
  );

  const computed = await computeTemplates(
    month,
    true,
    categoryTemplates,
    [],
    true,
  );
  errors.push(...computed.errors);

  const sheetName = monthUtils.sheetForMonth(month);
  const categories: TemplatePreviewCategory[] = [];
  for (const context of computed.contexts) {
    if (context.isGoalOnly()) continue;
    const { id } = context.category;
    const templates = categoryTemplates[id];
    const note = notesById.get(id);
    const values = context.getValues();
    categories.push({
      id,
      budgeted: await getSheetValue(sheetName, `budget-${id}`),
      requested: values.budgeted,
      lines: note
        ? await getNoteLines(note, templates, values.perTemplateContribution)
        : [
            {
              label: null,
              templateText: await renderTemplates(templates),
              requested: values.budgeted,
              editableAmount: null,
              isRemainder: templates.some(t => t.type === 'remainder'),
            },
          ],
    });
  }
  return { categories, errors };
}

async function getNoteLines(
  note: string,
  templates: Template[],
  contributions: Map<Template, number>,
): Promise<TemplatePreviewLine[]> {
  const editableAmounts = getEditableTemplateAmounts(note);
  const templateLines = templates.filter(t =>
    t.type === 'error' ? isTemplateLine(t.line) : t.directive === 'template',
  );
  return Promise.all(
    templateLines.map(async (template, index) => ({
      label: template.description?.split('\n').join(' ') ?? null,
      templateText:
        template.type === 'error'
          ? template.line.trim()
          : await renderTemplates([template]),
      requested: contributions.get(template) ?? 0,
      editableAmount: editableAmounts[index] ?? null,
      isRemainder: template.type === 'remainder',
    })),
  );
}

function renderTemplates(templates: Template[]) {
  return unparse(templates.map(t => ({ ...t, description: undefined })));
}

// Rewrites the amount on one #template line of a category's note, then
// refreshes the stored template so the next preview or apply sees it.
export async function setTemplateAmount({
  categoryId,
  templateIndex,
  amount,
}: {
  categoryId: CategoryEntity['id'];
  templateIndex: number;
  amount: number;
}): Promise<boolean> {
  const [row] = await getCategoriesWithTemplateNotes([categoryId]);
  if (!row) return false;
  const note = setEditableTemplateAmount(row.note, templateIndex, amount);
  if (note == null) return false;
  await db.update('notes', { id: categoryId, note });
  await storeNoteTemplates([categoryId]);
  return true;
}
