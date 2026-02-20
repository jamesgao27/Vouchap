import Constants from 'expo-constants';

/** 是否显示 AI 进销存入口与功能；production 构建时通过 EXPO_PUBLIC_SHOW_AI_INVENTORY=false 设为 false */
export const showAiInventory =
  (Constants.expoConfig as { extra?: { showAiInventory?: boolean } } | null)?.extra?.showAiInventory !== false;
