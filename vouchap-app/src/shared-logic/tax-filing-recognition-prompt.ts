/**
 * 报税模块：文件识别用提示词（北美税表/附件）。
 * - 从 todo 提交时：注入 Project + Todo 信息（国别、报税场景、phase/section/task），并省略无关场景。
 * - 从项目内通用入口（如 chat）提交时：仅注入 Project 信息（国别、报税场景）。
 */

export type TaxFilingJurisdiction = 'CANADA' | 'USA';
export type TaxFilingScenario = 'T1' | 'T2' | '1040' | '1120-S' | string;

export interface TaxFilingProjectContext {
  /** 国别，用于限定识别场景 */
  country: TaxFilingJurisdiction;
  /** 报税场景，如 T1 / T2 / 1040 / 1120-S */
  taxScenario: TaxFilingScenario;
}

export interface TaxFilingTodoContext {
  /** 归类层级：phase（如 P1: 基础准入） */
  phase?: string;
  /** section（如 资料收集） */
  section?: string;
  /** task（具体任务项） */
  task?: string;
}

const BASE_SYSTEM_PROMPT = `# Role
Expert North American Tax Auditor (CRA & IRS Specialist).

# Task
Analyze the provided image/PDF, identify the document type, and extract structured data into JSON.

# General Rules
1. Format all dates as YYYY-MM-DD.
2. Convert all currency/amounts to floats (remove symbols/commas).
3. Identify Currency (CAD/USD) and Tax Year.
4. Output ONLY valid JSON.

# Output Schema
{
  "doc_type": "STRING_IDENTIFIER",
  "confidence_score": 0.00,
  "summary": "One sentence summary",
  "extracted_data": {
    /* Fields mapped based on the scenarios below */
  },
  "metadata": {
    "currency": "CAD|USD",
    "tax_year": "YYYY",
    "issuer": "Entity Name",
    "is_legible": true
  },
  "suggested_task_id": "OPTIONAL: only when task list is provided and this document clearly belongs to a different task than the current classification; must be one of the task ids from the list"
}
`;

const SCENARIO_CANADA_T1 = `
## SCENARIO: CANADA T1 (Personal Tax)
- **CANADA_T4**: Extract Box 14 (Income), 22 (Tax), 24 (EI), 26 (CPP), Employer Name.
- **CANADA_T5**: Extract Box 13 (Interest), 14 (Dividends), 15 (Foreign Income), Issuer Name.
- **RRSP_CONTRIBUTION**: Extract Contribution Amount, Period (First 60 days vs Rest of Year).
- **DONATION_RECEIPT**: Extract Eligible Amount, Charity Registration Number.
`;

const SCENARIO_CANADA_T2 = `
## SCENARIO: CANADA T2 (Corporate Tax)
- **FINANCIAL_STATEMENT**: Extract Total Revenue, Net Income, Total Assets, Total Liabilities.
- **T2_SCHEDULE_1**: Extract Net Income for Tax Purposes, Additions, Deductions.
- **GST_HST_SUMMARY**: Extract Total Sales, GST/HST Collected, ITC (Input Tax Credits).
`;

const SCENARIO_USA_1040 = `
## SCENARIO: USA 1040 (Individual Tax)
- **US_W2**: Extract Box 1 (Wages), 2 (Fed Tax), 3 (Social Security Wages), 4 (SS Tax), Employer EIN.
- **US_1099_INT**: Extract Box 1 (Interest), 4 (Fed Tax Withheld).
- **US_1099_DIV**: Extract Box 1a (Ordinary Dividends), 1b (Qualified Dividends).
- **US_1098_T**: Extract Box 1 (Payments Received), Institution Name.
`;

const SCENARIO_USA_1120S = `
## SCENARIO: USA 1120-S (S-Corp)
- **SCHEDULE_K1**: Extract Part III Box 1 (Ordinary Business Income), Box 2 (Rental Income), Shareholder % of Stock.
- **US_1120S_PAGE1**: Extract Gross Receipts, Cost of Goods Sold, Total Deductions.
`;

const SCENARIO_EXPENSE = `
## COMMON: GENERAL EXPENSES
- **EXPENSE_RECEIPT**: Extract Vendor, Date, Total, Tax (GST/HST/Sales Tax), Subtotal. Suggest Category (e.g., Office, Travel).
`;

function scenariosForContext(project: TaxFilingProjectContext, todo?: TaxFilingTodoContext): string {
  const { country, taxScenario } = project;
  const scenarios: string[] = [];

  if (country === 'CANADA') {
    if (taxScenario === 'T1' || !todo) scenarios.push(SCENARIO_CANADA_T1);
    if (taxScenario === 'T2' || !todo) scenarios.push(SCENARIO_CANADA_T2);
  }
  if (country === 'USA') {
    if (taxScenario === '1040' || !todo) scenarios.push(SCENARIO_USA_1040);
    if (taxScenario === '1120-S' || !todo) scenarios.push(SCENARIO_USA_1120S);
  }
  // 若未指定或双国，则都包含
  if (country !== 'CANADA' && country !== 'USA') {
    scenarios.push(SCENARIO_CANADA_T1, SCENARIO_CANADA_T2, SCENARIO_USA_1040, SCENARIO_USA_1120S);
  }
  scenarios.push(SCENARIO_EXPENSE);

  return '\n# Specific Extraction Logic (Scenario-Based)\n' + scenarios.join('\n');
}

/** 项目 task 清单项（id + title），拼入提示词供 AI 关联时对应到正确 task */
export interface TaxFilingTaskListItem {
  id: string;
  title: string;
}

/**
 * 构建带上下文的报税文件识别提示词（供 AI 调用方使用）。
 * - 若提供 todoContext：注入 Project + Todo（phase/section/task），并只保留与 project 国别/场景相关的部分。
 * - 若提供 taskList：拼合项目完整 task 清单，要求 AI 返回数据关联时务必对应到对应 task，错位时通过 suggested_task_id 纠正。
 * - 若仅 projectContext：注入 Project（国别、报税场景），省略与项目无关的 scenario 细节可在此做精简。
 */
export function buildTaxFilingRecognitionPrompt(opts: {
  projectContext: TaxFilingProjectContext;
  todoContext?: TaxFilingTodoContext;
  /** 项目下全部 task 清单（id + title），拼入提示词以便 AI 关联到正确 task，避免多文件时错位 */
  taskList?: TaxFilingTaskListItem[];
  /** 用户随文件一起提交的说明，纳入提示词以辅助识别 */
  userInstructions?: string;
}): string {
  const { projectContext, todoContext, taskList, userInstructions } = opts;
  const scenarios = scenariosForContext(projectContext, todoContext);

  let contextBlock = `
# Current context (use to focus extraction)
- Jurisdiction: ${projectContext.country}
- Tax scenario: ${projectContext.taxScenario}
`;
  if (todoContext) {
    contextBlock += `
- Attachment is classified under: Phase: ${todoContext.phase ?? '—'}, Section: ${todoContext.section ?? '—'}, Task: ${todoContext.task ?? '—'}
- Prefer document types and fields relevant to this classification; omit scenarios that do not apply.
`;
  } else {
    contextBlock += `
- No specific task classification; extract according to the scenarios that match the jurisdiction and tax scenario above.
`;
  }
  if (taskList && taskList.length > 0) {
    contextBlock += `
# Project task list (associate this document with the correct task)
The following are the ONLY valid tasks for this project. When returning data, the association must match the correct task.
If this document clearly belongs to a different task than the current classification above, set "suggested_task_id" in your JSON output to that task's id; otherwise omit suggested_task_id.
Task list (id must be used exactly):
${taskList.map((t) => `- id: "${t.id}", title: "${t.title}"`).join('\n')}
`;
  }
  if (userInstructions?.trim()) {
    contextBlock += `
# User instructions (consider when extracting)
${userInstructions.trim()}
`;
  }

  return BASE_SYSTEM_PROMPT + scenarios + contextBlock;
}

/** 无上下文的完整提示词（通用/后备），包含全部场景 */
export function getFullTaxFilingRecognitionPrompt(): string {
  return (
    BASE_SYSTEM_PROMPT +
    '\n# Specific Extraction Logic (Scenario-Based)\n' +
    SCENARIO_CANADA_T1 +
    SCENARIO_CANADA_T2 +
    SCENARIO_USA_1040 +
    SCENARIO_USA_1120S +
    SCENARIO_EXPENSE
  );
}
