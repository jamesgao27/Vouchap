import Constants from 'expo-constants';

const extra = (Constants.expoConfig as { extra?: Record<string, unknown> } | null)?.extra ?? {};

/** 是否显示 AI 进销存入口与功能；仅当 extra.showAiInventory === true 时显示，缺省/undefined 视为不显示（production 安全） */
export const showAiInventory = extra.showAiInventory === true;

/** 是否显示报税入口与功能；与 AI Inventory 同规则（仅 develop 或显式 true）。若 extra.showTaxFiling 未注入，则与 showAiInventory 同进退，避免 develop 下漏显 */
export const showTaxFiling = extra.showTaxFiling === true || extra.showAiInventory === true;
