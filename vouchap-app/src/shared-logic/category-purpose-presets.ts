/**
 * 分类与用途预设：支出与收入分别维护，分别提交给模型作为备选项。
 * 数据库不增加表，原表 categories / purposes 增加 scope 字段区分。
 */

export type ExpenseIncomeScope = 'expense' | 'income';

/** 支出分类预设 */
export const DEFAULT_EXPENSE_CATEGORIES = [
  'Groceries',
  'Travel',
  'Meal',
  'Housing',
  'Health',
  'Clothing',
  'Education',
  'Entertainment',
  'Software',
  'Utilities',
  'Tax',
  'Refund',
] as const;

/** 支出用途预设 */
export const DEFAULT_EXPENSE_PURPOSES = [
  'Personal',
  'Business',
  'Client',
] as const;

/** 收入分类预设（含 Other 时排最后） */
export const DEFAULT_INCOME_CATEGORIES = [
  'Salary',
  'Sales',
  'Fee',
  'Bonus',
  'Tax',
  'Grant',
  'Refund',
  'Other', // 有 Other 的列表统一排最后
] as const;

/** 收入来源（用途）预设 */
export const DEFAULT_INCOME_PURPOSES = [
  'Employer',
  'Client',
  'Gov',
  'Private',
] as const;

/** 标签颜色库（分类/用途选择器中的 10 色，与 SQL 新建空间预设一致） */
export const TAG_COLOR_LIBRARY = [
  '#F47C7C', '#5DC8B4', '#37B9DC', '#F7A87A', '#A8E0C4',
  '#FBF177', '#B494DA', '#F0A093', '#A3D8F5', '#87E09A',
] as const;

export const DEFAULT_CATEGORY_COLOR = TAG_COLOR_LIBRARY[0];
export const DEFAULT_PURPOSE_COLOR = TAG_COLOR_LIBRARY[0];
