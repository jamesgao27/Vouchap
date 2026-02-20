-- ============================================
-- 修复 get_user_by_id：改用 current_space_id（与 users 表一致）
-- 错误：column u.current_household_id does not exist
-- 在 Supabase Dashboard → SQL Editor 中执行此脚本
-- ============================================

-- 返回类型变了（列名 current_household_id → current_space_id），必须先 DROP 再创建
DROP FUNCTION IF EXISTS get_user_by_id(UUID);

CREATE OR REPLACE FUNCTION get_user_by_id(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  email TEXT,
  name TEXT,
  current_space_id UUID,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.name,
    u.current_space_id,
    u.created_at
  FROM users u
  WHERE u.id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_by_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_by_id(UUID) TO anon;
