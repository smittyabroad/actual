import { vi } from 'vitest';

import * as aql from '#server/aql';
import * as db from '#server/db';
import type { DbCategory } from '#server/db';
import type { CategoryEntity } from '#types/models';
import type { Template } from '#types/models/templates';

import * as actions from './actions';
import {
  applyMultipleCategoryTemplates,
  applyTemplate,
  dryRunCategoryTemplate,
  previewTemplates,
  setTemplateAmount,
} from './goal-template';
import * as statements from './statements';
import * as templateNotes from './template-notes';

vi.mock('./actions', () => ({
  getSheetValue: vi.fn(),
  getSheetBoolean: vi.fn(),
  isTrackingBudget: vi.fn(),
  setBudget: vi.fn(),
  setGoal: vi.fn(),
}));

vi.mock('#server/db', () => ({
  getCategories: vi.fn(),
  first: vi.fn(),
  update: vi.fn(),
}));

vi.mock('#server/aql', () => ({
  aqlQuery: vi.fn(),
}));

vi.mock('#server/sync', () => ({
  batchMessages: (fn: () => Promise<void>) => fn(),
}));

vi.mock('./statements', () => ({
  getActiveSchedules: vi.fn(),
  getCategoriesWithTemplateNotes: vi.fn(),
}));

vi.mock('./template-notes', () => ({
  checkTemplateNotes: vi.fn(),
  storeNoteTemplates: vi.fn(),
  getCategoriesWithTemplates: vi.fn(),
  getEditableTemplateAmounts: vi.fn(),
  isTemplateLine: (line: string) => line.trim().startsWith('#template'),
  setEditableTemplateAmount: vi.fn(),
  unparse: vi.fn(),
}));

const category: CategoryEntity = {
  id: 'cat-1',
  name: 'Groceries',
  group: 'g1',
  is_income: false,
};

function setupSheetMock(values: Record<string, number>) {
  vi.mocked(actions.getSheetValue).mockImplementation(
    async (_sheet: string, key: string) => values[key] ?? 0,
  );
  vi.mocked(actions.getSheetBoolean).mockResolvedValue(false);
  vi.mocked(actions.isTrackingBudget).mockReturnValue(false);
}

function setupAqlForCategoryLookup(cat: CategoryEntity) {
  vi.mocked(aql.aqlQuery).mockImplementation(async (query: unknown) => {
    const queryStr = JSON.stringify(query);
    if (queryStr.includes('hideFraction')) {
      return { data: [{ value: 'false' }], dependencies: [] };
    }
    if (queryStr.includes('defaultCurrencyCode')) {
      return { data: [{ value: 'USD' }], dependencies: [] };
    }
    if (queryStr.includes('category_groups')) {
      return {
        data: [{ id: cat.group, hidden: false, categories: [cat] }],
        dependencies: [],
      };
    }
    if (queryStr.includes('categories')) {
      return { data: [cat], dependencies: [] };
    }
    return { data: [], dependencies: [] };
  });
}

function setupAqlForWideScope(
  savedTemplatesByCategory: Array<{
    category: CategoryEntity;
    templates: Template[];
  }>,
  categoriesInGroup: CategoryEntity[],
) {
  vi.mocked(aql.aqlQuery).mockImplementation(async (query: unknown) => {
    const queryStr = JSON.stringify(query);
    if (queryStr.includes('hideFraction')) {
      return { data: [{ value: 'false' }], dependencies: [] };
    }
    if (queryStr.includes('defaultCurrencyCode')) {
      return { data: [{ value: 'USD' }], dependencies: [] };
    }
    if (queryStr.includes('goal_def')) {
      return {
        data: savedTemplatesByCategory.map(({ category, templates }) => ({
          ...category,
          goal_def: JSON.stringify(templates),
        })),
        dependencies: [],
      };
    }
    if (queryStr.includes('category_groups')) {
      return {
        data: [{ id: 'g1', hidden: false, categories: categoriesInGroup }],
        dependencies: [],
      };
    }
    return { data: [], dependencies: [] };
  });
}

describe('dryRunCategoryTemplate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(statements.getActiveSchedules).mockResolvedValue(
      [] as Awaited<ReturnType<typeof statements.getActiveSchedules>>,
    );
    vi.mocked(db.getCategories).mockResolvedValue([]);
  });

  it('budgets a single periodic template through the engine end-to-end', async () => {
    setupSheetMock({ 'to-budget': 100000 });
    setupAqlForCategoryLookup(category);

    const templates: Template[] = [
      {
        type: 'periodic',
        amount: 100,
        period: { period: 'month', amount: 1 },
        starting: '2024-01-01',
        directive: 'template',
        priority: 1,
      },
    ];
    const result = await dryRunCategoryTemplate({
      month: '2024-01',
      categoryId: category.id,
      templates,
    });
    expect(result.budgeted).toBe(10000);
    expect(result.perTemplate).toEqual([10000]);
  });

  it('clamps a periodic + percentage stack at the balance cap', async () => {
    setupSheetMock({ 'to-budget': 1_000_000, 'total-income': 100000 });
    setupAqlForCategoryLookup(category);

    const templates: Template[] = [
      {
        type: 'periodic',
        amount: 100,
        period: { period: 'month', amount: 1 },
        starting: '2024-01-01',
        directive: 'template',
        priority: 1,
      },
      {
        type: 'percentage',
        percent: 50,
        previous: false,
        category: 'all income',
        directive: 'template',
        priority: 1,
      },
      {
        type: 'limit',
        amount: 200,
        hold: false,
        period: 'monthly',
        directive: 'template',
        priority: null,
      },
    ];
    const result = await dryRunCategoryTemplate({
      month: '2024-01',
      categoryId: category.id,
      templates,
    });
    // $100 + 50% of $1000 = $600 demanded, capped at $200.
    expect(result.budgeted).toBe(20000);
    expect(result.perTemplate.reduce((a, b) => a + b, 0)).toBe(20000);
    expect(result.perTemplate[2]).toBe(0); // cap row contributes nothing
  });

  it('returns zeros when the category lookup yields nothing', async () => {
    setupSheetMock({});
    vi.mocked(aql.aqlQuery).mockImplementation(async (query: unknown) => {
      const queryStr = JSON.stringify(query);
      if (queryStr.includes('hideFraction')) {
        return { data: [{ value: 'false' }], dependencies: [] };
      }
      if (queryStr.includes('defaultCurrencyCode')) {
        return { data: [{ value: 'USD' }], dependencies: [] };
      }
      return { data: [], dependencies: [] };
    });

    const templates: Template[] = [
      {
        type: 'periodic',
        amount: 100,
        period: { period: 'month', amount: 1 },
        starting: '2024-01-01',
        directive: 'template',
        priority: 1,
      },
    ];
    const result = await dryRunCategoryTemplate({
      month: '2024-01',
      categoryId: 'missing',
      templates,
    });
    expect(result).toEqual({ budgeted: 0, perTemplate: [0] });
  });

  it('shows full demand even when To Budget cannot cover it', async () => {
    // With priority>0 and a constrained To Budget, the engine clamps the
    // actual budgeted amount to fit. The dry run should still report the
    // templates' full demand so the user sees what the rules want, not
    // what would survive clamping.
    setupSheetMock({ 'to-budget': 5000 });
    setupAqlForCategoryLookup(category);

    const templates: Template[] = [
      {
        type: 'periodic',
        amount: 1800,
        period: { period: 'month', amount: 1 },
        starting: '2026-05-01',
        directive: 'template',
        priority: 150,
      },
      {
        type: 'periodic',
        amount: 3200,
        period: { period: 'month', amount: 3 },
        starting: '2026-06-01',
        directive: 'template',
        priority: 150,
      },
    ];
    const result = await dryRunCategoryTemplate({
      month: '2026-06',
      categoryId: category.id,
      templates,
    });
    expect(result.budgeted).toBe(500000);
    expect(result.perTemplate).toEqual([180000, 320000]);
  });
});

describe('applyMultipleCategoryTemplates', () => {
  const cat1: CategoryEntity = {
    id: 'cat-1',
    name: 'Groceries',
    group: 'g1',
    is_income: false,
  };
  const cat2: CategoryEntity = {
    id: 'cat-2',
    name: 'Rent',
    group: 'g1',
    is_income: false,
  };

  function setupAqlMultiCategory(
    cats: CategoryEntity[],
    templatesById: Record<string, Template[]>,
  ) {
    vi.mocked(aql.aqlQuery).mockImplementation(async (query: unknown) => {
      const queryStr = JSON.stringify(query);
      if (queryStr.includes('hideFraction')) {
        return { data: [{ value: 'false' }], dependencies: [] };
      }
      if (queryStr.includes('defaultCurrencyCode')) {
        return { data: [{ value: 'USD' }], dependencies: [] };
      }
      if (queryStr.includes('goal_def')) {
        return {
          data: cats
            .filter(c => templatesById[c.id])
            .map(c => ({
              ...c,
              goal_def: JSON.stringify(templatesById[c.id]),
            })),
          dependencies: [],
        };
      }
      if (queryStr.includes('categories')) {
        return { data: cats, dependencies: [] };
      }
      return { data: [], dependencies: [] };
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(statements.getActiveSchedules).mockResolvedValue(
      [] as Awaited<ReturnType<typeof statements.getActiveSchedules>>,
    );
    vi.mocked(db.getCategories).mockResolvedValue([] as DbCategory[]);
  });

  it('writes per-category budgets and returns a success notification', async () => {
    setupSheetMock({ 'to-budget': 100000 });
    setupAqlMultiCategory([cat1, cat2], {
      [cat1.id]: [
        {
          type: 'periodic',
          amount: 100,
          period: { period: 'month', amount: 1 },
          starting: '2024-01-01',
          directive: 'template',
          priority: 1,
        },
      ],
      [cat2.id]: [
        {
          type: 'periodic',
          amount: 200,
          period: { period: 'month', amount: 1 },
          starting: '2024-01-01',
          directive: 'template',
          priority: 1,
        },
      ],
    });

    const result = await applyMultipleCategoryTemplates({
      month: '2024-01',
      categoryIds: [cat1.id, cat2.id],
    });

    expect(result.message).toBe('templates-applied');
    expect(result.count).toBe(2);
    expect(actions.setBudget).toHaveBeenCalledTimes(2);
    const budgetCalls = vi
      .mocked(actions.setBudget)
      .mock.calls.map(call => call[0]);
    const cat1Budget = budgetCalls.find(c => c.category === cat1.id);
    const cat2Budget = budgetCalls.find(c => c.category === cat2.id);
    expect(cat1Budget?.amount).toBe(10000);
    expect(cat2Budget?.amount).toBe(20000);
  });

  it('clamps lower-priority categories when funds run out', async () => {
    // Only $150 available; cat1 (p1) wants $100, cat2 (p2) wants $100.
    // p1 fully funded, p2 gets the remaining $50.
    setupSheetMock({ 'to-budget': 15000 });
    setupAqlMultiCategory([cat1, cat2], {
      [cat1.id]: [
        {
          type: 'periodic',
          amount: 100,
          period: { period: 'month', amount: 1 },
          starting: '2024-01-01',
          directive: 'template',
          priority: 1,
        },
      ],
      [cat2.id]: [
        {
          type: 'periodic',
          amount: 100,
          period: { period: 'month', amount: 1 },
          starting: '2024-01-01',
          directive: 'template',
          priority: 2,
        },
      ],
    });

    await applyMultipleCategoryTemplates({
      month: '2024-01',
      categoryIds: [cat1.id, cat2.id],
    });

    const budgetCalls = vi
      .mocked(actions.setBudget)
      .mock.calls.map(call => call[0]);
    const cat1Amount = Number(
      budgetCalls.find(c => c.category === cat1.id)?.amount ?? 0,
    );
    const cat2Amount = Number(
      budgetCalls.find(c => c.category === cat2.id)?.amount ?? 0,
    );
    expect(cat1Amount).toBe(10000);
    expect(cat2Amount).toBe(5000);
    expect(cat1Amount + cat2Amount).toBe(15000);
  });

  it('returns an error notification when a template fails validation', async () => {
    setupSheetMock({ 'to-budget': 100000 });
    setupAqlMultiCategory([cat1], {
      [cat1.id]: [
        {
          type: 'by',
          amount: 1200,
          month: '2023-12',
          annual: false,
          directive: 'template',
          priority: 1,
        },
      ],
    });

    const result = await applyMultipleCategoryTemplates({
      month: '2024-06',
      categoryIds: [cat1.id],
    });

    expect(result.message).toBe('template-errors');
    expect(result.pre).toMatch(/Target month has passed/);
    expect(actions.setBudget).not.toHaveBeenCalled();
  });

  it('resets goal_def for orphan categories whose templates were removed', async () => {
    // Category had a stored goal but no current template — the goal must
    // be cleared so the sidebar marker disappears.
    setupSheetMock({
      'to-budget': 0,
      'budget-cat-1': 5000,
      'goal-cat-1': 12345,
    });
    setupAqlMultiCategory([cat1], {});

    const result = await applyMultipleCategoryTemplates({
      month: '2024-01',
      categoryIds: [cat1.id],
    });

    expect(result.message).toBe('templates-up-to-date');
    const goalCalls = vi.mocked(actions.setGoal).mock.calls.map(c => c[0]);
    expect(goalCalls).toContainEqual(
      expect.objectContaining({ category: cat1.id, goal: null }),
    );
  });

  it('distributes remainder funds across categories by weight', async () => {
    // Weights 3 and 1; $200 split 75% / 25%.
    setupSheetMock({ 'to-budget': 20000 });
    setupAqlMultiCategory([cat1, cat2], {
      [cat1.id]: [
        {
          type: 'remainder',
          weight: 3,
          directive: 'template',
          priority: null,
        },
      ],
      [cat2.id]: [
        {
          type: 'remainder',
          weight: 1,
          directive: 'template',
          priority: null,
        },
      ],
    });

    await applyMultipleCategoryTemplates({
      month: '2024-01',
      categoryIds: [cat1.id, cat2.id],
    });

    const budgetCalls = vi
      .mocked(actions.setBudget)
      .mock.calls.map(call => call[0]);
    const cat1Amount = Number(
      budgetCalls.find(c => c.category === cat1.id)?.amount ?? 0,
    );
    const cat2Amount = Number(
      budgetCalls.find(c => c.category === cat2.id)?.amount ?? 0,
    );
    expect(cat1Amount).toBe(15000);
    expect(cat2Amount).toBe(5000);
    expect(cat1Amount + cat2Amount).toBe(20000);
  });
});

describe('tracking budget priority handling (issue #8422)', () => {
  const cat1: CategoryEntity = {
    id: 'cat-1',
    name: 'Groceries',
    group: 'g1',
    is_income: false,
  };
  const cat2: CategoryEntity = {
    id: 'cat-2',
    name: 'Rent',
    group: 'g1',
    is_income: false,
  };

  function setupAqlMultiCategory(
    cats: CategoryEntity[],
    templatesById: Record<string, Template[]>,
  ) {
    vi.mocked(aql.aqlQuery).mockImplementation(async (query: unknown) => {
      const queryStr = JSON.stringify(query);
      if (queryStr.includes('hideFraction')) {
        return { data: [{ value: 'false' }], dependencies: [] };
      }
      if (queryStr.includes('defaultCurrencyCode')) {
        return { data: [{ value: 'USD' }], dependencies: [] };
      }
      if (queryStr.includes('goal_def')) {
        return {
          data: cats
            .filter(c => templatesById[c.id])
            .map(c => ({
              ...c,
              goal_def: JSON.stringify(templatesById[c.id]),
            })),
          dependencies: [],
        };
      }
      if (queryStr.includes('categories')) {
        return { data: cats, dependencies: [] };
      }
      return { data: [], dependencies: [] };
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(statements.getActiveSchedules).mockResolvedValue(
      [] as Awaited<ReturnType<typeof statements.getActiveSchedules>>,
    );
    vi.mocked(db.getCategories).mockResolvedValue([] as DbCategory[]);
  });

  it('funds a priority>0 template from total-saved since tracking budgets have no to-budget cell', async () => {
    // Regression test for #8422: `to-budget` is 0 (it doesn't exist for
    // tracking budgets), but `total-saved` reflects real budgeted income,
    // so the priority>0 template should still get funded instead of
    // clamping to 0.
    setupSheetMock({ 'to-budget': 0, 'total-saved': 100000 });
    vi.mocked(actions.isTrackingBudget).mockReturnValue(true);
    setupAqlMultiCategory([cat1], {
      [cat1.id]: [
        {
          type: 'periodic',
          amount: 100,
          period: { period: 'month', amount: 1 },
          starting: '2024-01-01',
          directive: 'template',
          priority: 1,
        },
      ],
    });

    const result = await applyMultipleCategoryTemplates({
      month: '2024-01',
      categoryIds: [cat1.id],
    });

    expect(result.message).toBe('templates-applied');
    const budgetCalls = vi
      .mocked(actions.setBudget)
      .mock.calls.map(call => call[0]);
    expect(budgetCalls.find(c => c.category === cat1.id)?.amount).toBe(10000);
  });

  it('clamps lower-priority categories proportionally once total-saved runs out', async () => {
    // Same shape as the envelope-budget "funds run out" test, but backed by
    // total-saved: priority is still meaningful in tracking budgets, it's
    // just not the identical no-clamp behavior of skipping the check
    // entirely.
    setupSheetMock({ 'to-budget': 0, 'total-saved': 15000 });
    vi.mocked(actions.isTrackingBudget).mockReturnValue(true);
    setupAqlMultiCategory([cat1, cat2], {
      [cat1.id]: [
        {
          type: 'periodic',
          amount: 100,
          period: { period: 'month', amount: 1 },
          starting: '2024-01-01',
          directive: 'template',
          priority: 1,
        },
      ],
      [cat2.id]: [
        {
          type: 'periodic',
          amount: 100,
          period: { period: 'month', amount: 1 },
          starting: '2024-01-01',
          directive: 'template',
          priority: 2,
        },
      ],
    });

    await applyMultipleCategoryTemplates({
      month: '2024-01',
      categoryIds: [cat1.id, cat2.id],
    });

    const budgetCalls = vi
      .mocked(actions.setBudget)
      .mock.calls.map(call => call[0]);
    const cat1Amount = Number(
      budgetCalls.find(c => c.category === cat1.id)?.amount ?? 0,
    );
    const cat2Amount = Number(
      budgetCalls.find(c => c.category === cat2.id)?.amount ?? 0,
    );
    expect(cat1Amount).toBe(10000);
    expect(cat2Amount).toBe(5000);
    expect(cat1Amount + cat2Amount).toBe(15000);
  });
});

describe('applyTemplate (force=false)', () => {
  const cat1: CategoryEntity = {
    id: 'cat-1',
    name: 'Groceries',
    group: 'g1',
    is_income: false,
  };
  const cat2: CategoryEntity = {
    id: 'cat-2',
    name: 'Rent',
    group: 'g1',
    is_income: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(statements.getActiveSchedules).mockResolvedValue(
      [] as Awaited<ReturnType<typeof statements.getActiveSchedules>>,
    );
    vi.mocked(db.getCategories).mockResolvedValue([] as DbCategory[]);
  });

  it('skips categories that already have a non-zero budget', async () => {
    // cat1 starts unbudgeted → gets templated. cat2 already has $50
    // budgeted → must be left alone, since force=false is the
    // "fill in the blanks" semantic.
    setupSheetMock({
      'to-budget': 100000,
      'budget-cat-1': 0,
      'budget-cat-2': 5000,
    });
    setupAqlForWideScope(
      [
        {
          category: cat1,
          templates: [
            {
              type: 'periodic',
              amount: 100,
              period: { period: 'month', amount: 1 },
              starting: '2024-01-01',
              directive: 'template',
              priority: 1,
            },
          ],
        },
        {
          category: cat2,
          templates: [
            {
              type: 'periodic',
              amount: 200,
              period: { period: 'month', amount: 1 },
              starting: '2024-01-01',
              directive: 'template',
              priority: 1,
            },
          ],
        },
      ],
      [cat1, cat2],
    );

    await applyTemplate({ month: '2024-01' });

    const budgetCalls = vi
      .mocked(actions.setBudget)
      .mock.calls.map(call => call[0]);
    expect(budgetCalls.map(c => c.category)).toEqual([cat1.id]);
    expect(budgetCalls[0].amount).toBe(10000);
  });
});

describe('previewTemplates', () => {
  const groceries: CategoryEntity = { ...category, id: 'groceries' };
  const upTo1600: Template = {
    type: 'simple',
    limit: { amount: 1600, hold: false, period: 'monthly' },
    priority: 0,
    directive: 'template',
  };

  function setupNote(note: string, templates: Template[]) {
    vi.mocked(statements.getCategoriesWithTemplateNotes).mockResolvedValue([
      { id: groceries.id, name: groceries.name, note },
    ]);
    vi.mocked(templateNotes.getCategoriesWithTemplates).mockResolvedValue([
      { id: groceries.id, name: groceries.name, templates },
    ]);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(statements.getActiveSchedules).mockResolvedValue(
      [] as Awaited<ReturnType<typeof statements.getActiveSchedules>>,
    );
    vi.mocked(templateNotes.unparse).mockImplementation(async templates =>
      templates.map(t => `#template ${t.type}`).join('\n'),
    );
    setupAqlForWideScope([], [groceries]);
  });

  it('reports what templates ask for without budgeting anything', async () => {
    // To Budget is empty, so an apply would clamp; the preview must not.
    setupSheetMock({ 'to-budget': 0, [`budget-${groceries.id}`]: 50000 });
    setupNote('#template up to 1600', [upTo1600]);
    vi.mocked(templateNotes.getEditableTemplateAmounts).mockReturnValue([1600]);

    const result = await previewTemplates({ month: '2024-01' });

    expect(result.errors).toEqual([]);
    expect(result.categories).toEqual([
      {
        id: groceries.id,
        budgeted: 50000,
        requested: 160000,
        lines: [
          {
            label: null,
            templateText: '#template simple',
            requested: 160000,
            editableAmount: 1600,
            isRemainder: false,
          },
        ],
      },
    ]);
    expect(actions.setBudget).not.toHaveBeenCalled();
    expect(actions.setGoal).not.toHaveBeenCalled();
    expect(templateNotes.storeNoteTemplates).not.toHaveBeenCalled();
  });

  it('splits a multi-template category into one line per template', async () => {
    setupSheetMock({ 'to-budget': 0 });
    const monthly = (monthlyAmount: number, description: string): Template => ({
      type: 'simple',
      monthly: monthlyAmount,
      priority: 0,
      directive: 'template',
      description,
    });
    setupNote('Metro\n#template 65\n#goal 500\nFios\n#template 20', [
      monthly(65, 'Metro'),
      { type: 'goal', amount: 500, directive: 'goal' },
      monthly(20, 'Fios'),
    ]);
    vi.mocked(templateNotes.getEditableTemplateAmounts).mockReturnValue([
      65, 20,
    ]);

    const [phone] = (await previewTemplates({ month: '2024-01' })).categories;

    expect(phone.requested).toBe(8500);
    expect(phone.lines).toEqual([
      expect.objectContaining({
        label: 'Metro',
        requested: 6500,
        editableAmount: 65,
      }),
      expect.objectContaining({
        label: 'Fios',
        requested: 2000,
        editableAmount: 20,
      }),
    ]);
  });

  it('lists templates that could not be parsed', async () => {
    setupSheetMock({});
    setupNote('#template up to 1600\n#template nonsense', [
      upTo1600,
      {
        type: 'error',
        directive: 'error',
        line: '#template nonsense',
        error: 'bad',
      },
    ]);
    vi.mocked(templateNotes.getEditableTemplateAmounts).mockReturnValue([
      1600,
      null,
    ]);

    const result = await previewTemplates({ month: '2024-01' });

    expect(result.errors).toEqual(['Groceries: #template nonsense']);
    expect(result.categories[0].requested).toBe(160000);
    expect(result.categories[0].lines[1]).toEqual({
      label: null,
      templateText: '#template nonsense',
      requested: 0,
      editableAmount: null,
      isRemainder: false,
    });
  });
});

describe('setTemplateAmount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(statements.getCategoriesWithTemplateNotes).mockResolvedValue([
      { id: 'phone', name: 'Phone', note: '#template 65\n#template 25' },
    ]);
  });

  it('rewrites the chosen line and refreshes the stored template', async () => {
    vi.mocked(templateNotes.setEditableTemplateAmount).mockReturnValue(
      '#template 65\n#template 30',
    );

    const result = await setTemplateAmount({
      categoryId: 'phone',
      templateIndex: 1,
      amount: 30,
    });

    expect(result).toBe(true);
    expect(templateNotes.setEditableTemplateAmount).toHaveBeenCalledWith(
      '#template 65\n#template 25',
      1,
      30,
    );
    expect(db.update).toHaveBeenCalledWith('notes', {
      id: 'phone',
      note: '#template 65\n#template 30',
    });
    expect(templateNotes.storeNoteTemplates).toHaveBeenCalledWith(['phone']);
  });

  it('leaves the note alone when the line is not editable', async () => {
    vi.mocked(templateNotes.setEditableTemplateAmount).mockReturnValue(null);

    const result = await setTemplateAmount({
      categoryId: 'phone',
      templateIndex: 5,
      amount: 30,
    });

    expect(result).toBe(false);
    expect(db.update).not.toHaveBeenCalled();
    expect(templateNotes.storeNoteTemplates).not.toHaveBeenCalled();
  });
});
