import type { RefillTemplate, Template } from '#types/models/templates';

import { storeTemplates } from './goal-template';
import { parse } from './goal-template.pegjs';
import {
  getActiveSchedules,
  getCategoriesWithTemplateNotes,
  resetCategoryGoalDefsWithNoTemplates,
} from './statements';
import type { CategoryWithTemplateNote } from './statements';
import type { TemplateNotification } from './template-notification';

export const TEMPLATE_PREFIX = '#template';
export const GOAL_PREFIX = '#goal';
const CLEANUP_PREFIX = '#cleanup';

export async function storeNoteTemplates(
  categoryIds?: string[],
): Promise<void> {
  const categoriesWithTemplates = await getCategoriesWithTemplates(categoryIds);

  await storeTemplates({ categoriesWithTemplates, source: 'notes' });

  await resetCategoryGoalDefsWithNoTemplates(categoryIds);
}

type CategoryWithTemplateNotes = {
  id: string;
  name: string;
  templates: Template[];
};

export async function checkTemplateNotes(): Promise<TemplateNotification> {
  const categoryWithTemplates = await getCategoriesWithTemplates();
  const schedules = await getActiveSchedules();
  const scheduleNames = schedules.map(({ name }) => name);
  const errors: string[] = [];

  categoryWithTemplates.forEach(({ name, templates }) => {
    templates.forEach(template => {
      if (template.type === 'error') {
        // Only show detailed error for adjustment-related errors
        if (template.error && template.error.includes('adjustment')) {
          errors.push(`${name}: ${template.line}\nError: ${template.error}`);
        } else {
          errors.push(`${name}: ${template.line}`);
        }
      } else if (
        template.type === 'schedule' &&
        template.name &&
        !scheduleNames.includes(template.name)
      ) {
        errors.push(`${name}: Schedule "${template.name}" does not exist`);
      }
    });
  });

  if (errors.length) {
    return {
      sticky: true,
      message: 'template-errors',
      pre: errors.join('\n\n'),
    };
  }

  return {
    type: 'message',
    message: 'templates-check-passed',
  };
}

// A #template line is editable from the preview when it holds one plain
// monthly amount: `#template 150`, `#template up to 1600`, or
// `#template 50 repeat every 1 months starting ...`.
function getAmountEditTarget(
  template: Template,
): { get: () => number; set: (amount: number) => Template } | null {
  if (template.type === 'simple') {
    const { monthly, limit } = template;
    if (monthly != null) {
      return {
        get: () => monthly,
        set: amount => ({ ...template, monthly: amount }),
      };
    }
    if (limit && limit.period === 'monthly') {
      return {
        get: () => limit.amount,
        set: amount => ({ ...template, limit: { ...limit, amount } }),
      };
    }
    return null;
  }
  if (
    template.type === 'periodic' &&
    template.period.period === 'month' &&
    template.period.amount === 1 &&
    !template.limit
  ) {
    const current = template.amount;
    return {
      get: () => current,
      set: amount => ({ ...template, amount }),
    };
  }
  return null;
}

export function isTemplateLine(line: string): boolean {
  return line
    .substring(line.indexOf('#'))
    .trim()
    .toLowerCase()
    .startsWith(TEMPLATE_PREFIX);
}

function parseEditTarget(line: string) {
  try {
    const template: Template = parse(line.substring(line.indexOf('#')).trim());
    return getAmountEditTarget(template);
  } catch {
    return null;
  }
}

// One entry per #template line in the note, in order: the line's editable
// amount, or null when that line can't be edited from the preview.
export function getEditableTemplateAmounts(note: string): Array<number | null> {
  return note
    .split('\n')
    .filter(isTemplateLine)
    .map(line => parseEditTarget(line)?.get() ?? null);
}

// Rewrites the amount on the `templateIndex`-th #template line of the note,
// leaving every other line untouched.
export function setEditableTemplateAmount(
  note: string,
  templateIndex: number,
  amount: number,
): string | null {
  const lines = note.split('\n');
  const lineIndex = lines
    .flatMap((line, index) => (isTemplateLine(line) ? [index] : []))
    .at(templateIndex);
  if (lineIndex === undefined) {
    return null;
  }
  const line = lines[lineIndex];
  const edit = parseEditTarget(line);
  if (!edit) {
    return null;
  }
  const newLine = templateToLine(edit.set(amount), undefined);
  if (newLine == null) {
    return null;
  }
  lines[lineIndex] = line.substring(0, line.indexOf('#')) + newLine;
  return lines.join('\n');
}

export async function getCategoriesWithTemplates(
  categoryIds?: string[],
): Promise<CategoryWithTemplateNotes[]> {
  const templatesForCategory: CategoryWithTemplateNotes[] = [];
  const templateNotes = await getCategoriesWithTemplateNotes(categoryIds);

  templateNotes.forEach(({ id, name, note }: CategoryWithTemplateNote) => {
    if (!note) {
      return;
    }

    const parsedTemplates: Template[] = [];
    // Non-directive lines directly above a template line are kept as that
    // template's description. A blank line or a different directive ends the
    // block.
    let descriptionLines: string[] = [];

    note.split('\n').forEach(line => {
      const trimmedLine = line.substring(line.indexOf('#')).trim();
      const isTemplateLine =
        trimmedLine.startsWith(TEMPLATE_PREFIX) ||
        trimmedLine.startsWith(GOAL_PREFIX);

      if (!isTemplateLine) {
        if (line.trim() === '' || trimmedLine.startsWith(CLEANUP_PREFIX)) {
          descriptionLines = [];
        } else {
          descriptionLines.push(line.trimEnd());
        }
        return;
      }

      const description =
        descriptionLines.length > 0 ? descriptionLines.join('\n') : undefined;
      descriptionLines = [];

      try {
        const parsedTemplate: Template = parse(trimmedLine);

        // Validate schedule adjustments
        if (
          (parsedTemplate.type === 'average' ||
            parsedTemplate.type === 'schedule') &&
          parsedTemplate.adjustment !== undefined
        ) {
          if (parsedTemplate.adjustmentType === 'percent') {
            if (
              parsedTemplate.adjustment <= -100 ||
              parsedTemplate.adjustment > 1000
            ) {
              throw new Error(
                `Invalid adjustment percentage (${parsedTemplate.adjustment}%). Must be between -100% and 1000%`,
              );
            }
          } else if (parsedTemplate.adjustmentType === 'fixed') {
            //placeholder for potential validation of amount/fixed adjustments
          }
        }

        parsedTemplates.push(
          description ? { ...parsedTemplate, description } : parsedTemplate,
        );
      } catch (e: unknown) {
        const errorTemplate: Template = {
          type: 'error',
          directive: 'error',
          line,
          error: (e as Error).message,
        };
        parsedTemplates.push(
          description ? { ...errorTemplate, description } : errorTemplate,
        );
      }
    });

    if (!parsedTemplates.length) {
      return;
    }

    templatesForCategory.push({
      id,
      name,
      templates: parsedTemplates,
    });
  });

  return templatesForCategory;
}

function prefixFromPriority(priority: number | null): string {
  // Priority 0 is the parser's "unset" default and serializes without a suffix.
  return priority === null || priority === 0
    ? TEMPLATE_PREFIX
    : `${TEMPLATE_PREFIX}-${priority}`;
}

function templateToLine(
  template: Template,
  refill: RefillTemplate | undefined,
): string | null {
  if (template.type === 'error') {
    return null;
  }

  if (template.type === 'goal') {
    return `${GOAL_PREFIX} ${template.amount}`;
  }

  const prefix = prefixFromPriority(template.priority);

  switch (template.type) {
    case 'simple': {
      // Simple template syntax: #template[-prio] simple [monthly N] [limit]
      let result = prefix;
      if (template.monthly != null) {
        result += ` ${template.monthly}`;
      }
      if (template.limit) {
        result += ` ${limitToString(template.limit)}`;
      }
      return result.trim();
    }
    case 'schedule': {
      // schedule syntax: #template[-prio] schedule <name> [full] [ [increase/decrease N%] ]
      let result = `${prefix} schedule`;
      if (template.full) {
        result += ' full';
      }
      result += ` ${template.name}`;
      if (template.adjustment !== undefined) {
        const adj = template.adjustment;
        const op = adj >= 0 ? 'increase' : 'decrease';
        const val = Math.abs(adj);
        const type = template.adjustmentType === 'percent' ? '%' : '';
        result += ` [${op} ${val}${type}]`;
      }
      return result;
    }
    case 'percentage': {
      // #template[-prio] <percent>% of [previous ]<category>
      const prev = template.previous ? 'previous ' : '';
      return `${prefix} ${trimTrailingZeros(template.percent)}% of ${prev}${template.category}`.trim();
    }
    case 'periodic': {
      // #template[-prio] <amount> repeat every <n> <period>(s) starting <date> [limit]
      const periodPart = periodToString(template.period);
      let result = `${prefix} ${template.amount} repeat every ${periodPart} starting ${template.starting}`;
      if (template.limit) {
        result += ` ${limitToString(template.limit)}`;
      }
      return result;
    }
    case 'by':
    case 'spend': {
      // #template[-prio] <amount> by <month> [spend from <month>] [repeat every <...>]
      let result = `${prefix} ${template.amount} by ${template.month}`;
      if (template.type === 'spend' && template.from) {
        result += ` spend from ${template.from}`;
      }
      // repeat info
      if (template.annual !== undefined) {
        const repeatInfo = repeatToString(template.annual, template.repeat);
        if (repeatInfo) {
          result += ` repeat every ${repeatInfo}`;
        }
      }
      return result;
    }
    case 'remainder': {
      // #template remainder [weight] [limit]
      let result = `${prefix} remainder`;
      if (template.weight !== undefined && template.weight !== 1) {
        result += ` ${template.weight}`;
      }
      if (template.limit) {
        result += ` ${limitToString(template.limit)}`;
      }
      return result;
    }
    case 'average': {
      // #template average <numMonths> months [increase/decrease {number|number%}]
      let result = `${prefix} average ${template.numMonths} months`;
      if (template.adjustment !== undefined) {
        const adj = template.adjustment;
        const op = adj >= 0 ? 'increase' : 'decrease';
        const val = Math.abs(adj);
        const type = template.adjustmentType === 'percent' ? '%' : '';
        result += ` [${op} ${val}${type}]`;
      }
      return result;
    }
    case 'copy': {
      // #template copy from <lookBack> months ago [limit]
      return `${prefix} copy from ${template.lookBack} months ago`;
    }
    case 'limit': {
      if (!refill) {
        // #template 0 up to <limit>
        return `${prefix} 0 ${limitToString(template)}`;
      }
      // #template up to <limit>
      const mergedPrefix = prefixFromPriority(refill.priority);
      return `${mergedPrefix} ${limitToString(template)}`;
    }
    // No 'refill' support since a refill requires a limit
    default:
      return null;
  }
}

export async function unparse(templates: Template[]): Promise<string> {
  // Refill will be merged into the limit template if both exist
  // Assumption: at most one limit and one refill template per category
  const refill = templates.find(t => t.type === 'refill');
  const withoutRefill = templates.filter(t => t.type !== 'refill');

  return withoutRefill
    .flatMap(template => {
      const line = templateToLine(template, refill);
      if (line == null) {
        return [];
      }
      const descriptionLines = (template.description ?? '')
        .split('\n')
        .map(descriptionLine => descriptionLine.trimEnd())
        .filter(descriptionLine => descriptionLine !== '');
      return [...descriptionLines, line];
    })
    .join('\n');
}

function limitToString(limit: {
  amount: number;
  hold: boolean;
  period?: 'daily' | 'weekly' | 'monthly';
  start?: string | undefined;
}): string {
  switch (limit.period) {
    case 'weekly': {
      // Needs start date per grammar
      const base = `up to ${limit.amount} per week starting ${limit.start}`;
      return limit.hold ? `${base} hold` : base;
    }
    case 'daily': {
      const base = `up to ${limit.amount} per day`;
      return limit.hold ? `${base} hold` : base;
    }
    case 'monthly':
    default: {
      const base = `up to ${limit.amount}`;
      return limit.hold ? `${base} hold` : base;
    }
  }
}

function periodToString(p: {
  period: 'day' | 'week' | 'month' | 'year';
  amount: number;
}): string {
  return `${p.amount} ${p.period}s`;
}

function repeatToString(annual?: boolean, repeat?: number): string | null {
  if (annual === undefined) return null;
  if (annual) {
    if (!repeat || repeat === 1) return 'year';
    return `${repeat} years`;
  }
  // monthly
  if (!repeat || repeat === 1) return 'month';
  return `${repeat} months`;
}

function trimTrailingZeros(n: number): string {
  const s = n.toString();
  if (!s.includes('.')) return s;
  return s.replace(/\.0+$/, '').replace(/(\.[0-9]*[1-9])0+$/, '$1');
}
