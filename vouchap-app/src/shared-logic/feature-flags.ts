import Constants from 'expo-constants';
import { Platform } from 'react-native';

const extra = (Constants.expoConfig as { extra?: Record<string, unknown> } | null)?.extra ?? {};
const isProduction = process.env.NODE_ENV === 'production';

/** 是否显示 AI 进销存入口与功能；仅当 extra.showAiInventory === true 时显示，缺省/undefined 视为不显示（production 安全） */
export const showAiInventory = extra.showAiInventory === true;

/**
 * 是否显示报税入口与功能。
 * - develop：与 showAiInventory 同进退（或显式 extra.showTaxFiling）。
 * - production web：始终显示。
 * - production app（iOS/Android）：不显示，除非显式 EXPO_PUBLIC_SHOW_TAX_FILING=true。
 */
export const showTaxFiling =
  extra.showTaxFiling === true ||
  extra.showAiInventory === true ||
  (isProduction && Platform.OS === 'web');
