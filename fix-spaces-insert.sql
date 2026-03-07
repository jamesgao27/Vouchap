-- ============================================
-- 一次性修复：spaces RLS + apply_preset_skus_to_firm 重载歧义
-- 在 Supabase SQL Editor 中执行此脚本
-- 说明：households 已废弃，当前使用 spaces；不要执行 fix-households-insert-*.sql
-- ============================================

-- 消除 42725：若存在 firm.apply_preset_skus_to_firm(uuid, text) 会导致单参数调用“不唯一”
DROP FUNCTION IF EXISTS firm.apply_preset_skus_to_firm(UUID, TEXT);
DROP FUNCTION IF EXISTS public.apply_preset_skus_to_firm(UUID, TEXT);

-- 【诊断】若修复后仍报 42501，请先单独执行下面查询，把结果贴给开发：
--   SELECT policyname, roles, with_check, permissive FROM pg_policies WHERE schemaname = 'public' AND tablename = 'spaces' AND cmd = 'INSERT' ORDER BY policyname;
-- 若结果为空或没有 roles 含 authenticated/public，说明策略未生效或被覆盖。

-- 第一步：按名称删除所有已知的 spaces INSERT 策略（含历史迁移中出现过的名称）
DROP POLICY IF EXISTS "spaces_insert_policy" ON public.spaces;
DROP POLICY IF EXISTS "spaces_insert_definer" ON public.spaces;
DROP POLICY IF EXISTS "spaces_insert_definer_owner" ON public.spaces;
DROP POLICY IF EXISTS "spaces_insert_service_role" ON public.spaces;
DROP POLICY IF EXISTS "spaces_insert_supabase_admin" ON public.spaces;
DROP POLICY IF EXISTS "spaces_insert_public" ON public.spaces;
DROP POLICY IF EXISTS "spaces_insert_anon" ON public.spaces;

-- 第一步续：删除其余可能残留的 INSERT 策略（按 pg_policies 动态删除）
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'spaces'
          AND cmd = 'INSERT'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.spaces', r.policyname);
        RAISE NOTICE 'Dropped INSERT policy: %', r.policyname;
    END LOOP;
END $$;

-- 第二步：确保 RLS 已启用
ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;

-- 第三步：创建 INSERT 策略
-- 3a. 已认证用户（前端创建 client/firm 时使用）
CREATE POLICY "spaces_insert_policy" ON public.spaces
  FOR INSERT TO authenticated WITH CHECK (true);

-- 3b. 函数所有者（RPC create_space_with_user 为 SECURITY DEFINER 时使用）
CREATE POLICY "spaces_insert_definer" ON public.spaces
  FOR INSERT TO postgres WITH CHECK (true);

-- 3c. 后端 service_role
CREATE POLICY "spaces_insert_service_role" ON public.spaces
  FOR INSERT TO service_role WITH CHECK (true);

-- 3d. 兜底：所有角色（含 anon），仅允许 kind=client|firm
CREATE POLICY "spaces_insert_public" ON public.spaces
  FOR INSERT TO public WITH CHECK (kind IN ('client', 'firm'));

-- 3e. 显式允许 anon（部分请求可能以 anon 身份到达）
CREATE POLICY "spaces_insert_anon" ON public.spaces
  FOR INSERT TO anon WITH CHECK (kind IN ('client', 'firm'));

-- supabase_admin（Cloud 上可能有；本地无此角色会报错，忽略即可）
DO $$
BEGIN
  CREATE POLICY "spaces_insert_supabase_admin" ON public.spaces
    FOR INSERT TO supabase_admin WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 第四步：表级权限
GRANT INSERT ON public.spaces TO authenticated;
GRANT INSERT ON public.spaces TO anon;

-- 第五步：user_spaces（直接创建空间时客户端会插入，需允许 authenticated）
ALTER TABLE public.user_spaces ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_spaces_insert_definer" ON public.user_spaces;
CREATE POLICY "user_spaces_insert_definer" ON public.user_spaces
  FOR INSERT TO postgres WITH CHECK (true);
DROP POLICY IF EXISTS "user_spaces_insert_authenticated" ON public.user_spaces;
CREATE POLICY "user_spaces_insert_authenticated" ON public.user_spaces
  FOR INSERT TO authenticated WITH CHECK (true);
GRANT INSERT ON public.user_spaces TO authenticated;

-- 第五步续：firm.skus / firm.sku_items（RPC 创建 firm 时 apply_preset_skus_to_firm 以 postgres 写入，缺此会 42501）
DROP POLICY IF EXISTS "firm_skus_insert_definer" ON firm.skus;
CREATE POLICY "firm_skus_insert_definer" ON firm.skus FOR INSERT TO postgres WITH CHECK (true);
DROP POLICY IF EXISTS "firm_skus_update_definer" ON firm.skus;
CREATE POLICY "firm_skus_update_definer" ON firm.skus FOR UPDATE TO postgres USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "firm_sku_items_insert_definer" ON firm.sku_items;
CREATE POLICY "firm_sku_items_insert_definer" ON firm.sku_items FOR INSERT TO postgres WITH CHECK (true);
DROP POLICY IF EXISTS "firm_sku_items_update_definer" ON firm.sku_items;
CREATE POLICY "firm_sku_items_update_definer" ON firm.sku_items FOR UPDATE TO postgres USING (true) WITH CHECK (true);

-- 第六步：验证 spaces 至少有一条 INSERT 策略（若无则说明上面 CREATE 未生效）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'spaces' AND cmd = 'INSERT') THEN
    RAISE EXCEPTION 'fix-spaces-insert: spaces 表上没有任何 INSERT 策略，请检查上面是否有 CREATE POLICY 报错';
  END IF;
END $$;

-- 第七步：输出 spaces 的 INSERT 策略（请确认有多条且包含 authenticated 或 public）
SELECT
    'spaces INSERT policies' AS check_type,
    policyname,
    roles,
    with_check,
    CASE WHEN with_check = 'true' OR with_check LIKE '%kind%' THEN '✓' ELSE '?' END AS status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'spaces'
  AND cmd = 'INSERT'
ORDER BY policyname;

-- 验证 user_spaces INSERT 策略
SELECT
    'user_spaces INSERT policies' AS check_type,
    policyname,
    roles,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'user_spaces'
  AND cmd = 'INSERT'
ORDER BY policyname;
