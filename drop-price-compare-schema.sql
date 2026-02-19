-- 移除比价模块 schema（在 Supabase SQL Editor 中执行）
-- 执行后需在 Dashboard → Settings → API 中从 Exposed schemas 移除 price_compare

DROP SCHEMA IF EXISTS price_compare CASCADE;
