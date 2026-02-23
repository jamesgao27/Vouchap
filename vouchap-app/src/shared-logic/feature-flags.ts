import Constants from 'expo-constants';

/** 是否显示 AI 进销存入口与功能；仅当 extra.showAiInventory === true 时显示，缺省/undefined 视为不显示（production 安全） */
export const showAiInventory =
  (Constants.expoConfig as { extra?: { showAiInventory?: boolean } } | null)?.extra?.showAiInventory === true;
