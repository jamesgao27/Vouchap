-- ============================================================
-- Firm 开放邀请：schema 与核心业务函数
-- 说明：
-- 1. firm.clients：Firm ↔ Client 的最终关系表（已存在时仅做字段补充）
-- 2. firm.client_invite_tokens：Firm 为某个 firm_space 生成的「开放邀请入口」
-- 3. firm.orders：Firm 对 Client 的服务订单（按 SKU）
-- 4. firm.accept_client_invite_token(...)：原子性地消费 token，创建/恢复 client 关系与订单
-- 
-- ⚠️ 本脚本可多次执行，均使用 IF NOT EXISTS / ADD COLUMN IF NOT EXISTS 保护。
-- ⚠️ 请在 Supabase SQL Editor 中执行。
-- ============================================================

CREATE SCHEMA IF NOT EXISTS firm;

-- ------------------------------------------------------------
-- 1. firm.clients 简化：不在表上维护 assignee / last_follow_up_at
--    - assignee 放在 firm.member_clients 中
--    - 最近跟进时间从 firm.client_follow_ups 聚合
-- ------------------------------------------------------------

DO $$
BEGIN
  -- 清理不再需要的派生字段：assigned_user_id / last_follow_up_at
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'firm'
      AND table_name   = 'clients'
      AND column_name  = 'assigned_user_id'
  ) THEN
    ALTER TABLE firm.clients
      DROP COLUMN assigned_user_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'firm'
      AND table_name   = 'clients'
      AND column_name  = 'last_follow_up_at'
  ) THEN
    ALTER TABLE firm.clients
      DROP COLUMN last_follow_up_at;
  END IF;
END $$;

-- 唯一性：同一 firm_space 与 client_space 仅一条关系
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'firm.clients'::regclass
      AND contype = 'u'
      AND conname = 'firm_clients_unique_pair'
  ) THEN
    ALTER TABLE firm.clients
      ADD CONSTRAINT firm_clients_unique_pair
      UNIQUE (firm_space_id, client_space_id);
  END IF;
END $$;

COMMENT ON TABLE firm.clients IS
  'Firm ↔ Client 关系：firm_space_id 与 client_space_id 的绑定；status=active 表示生效；assignee 与最近跟进时间从 member_clients / client_follow_ups 计算';

COMMENT ON COLUMN firm.clients.status IS
  '关系状态：active / ended 等';

-- ------------------------------------------------------------
-- 2. firm.client_invite_tokens：Firm 的开放邀请入口
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS firm.client_invite_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_space_id uuid NOT NULL,           -- 事务所所在 space
  token text NOT NULL UNIQUE,            -- 高熵随机串，用于 URL
  inviter_user_id uuid NOT NULL,         -- 生成邀请的 firm 端用户（可非管理员）
  sku_id uuid NOT NULL,                  -- firm 对 client 提供服务的 SKU
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,                -- 为空表示长期有效
  is_active boolean NOT NULL DEFAULT true,
  max_clients int,                       -- 通过此 token 最多可绑定多少 client（NULL = 不限制）
  current_clients int NOT NULL DEFAULT 0 -- 已通过此 token 绑定的 client 数
);

CREATE INDEX IF NOT EXISTS idx_client_invite_tokens_firm_space
  ON firm.client_invite_tokens (firm_space_id);

CREATE INDEX IF NOT EXISTS idx_client_invite_tokens_active
  ON firm.client_invite_tokens (is_active)
  WHERE is_active = true;

COMMENT ON TABLE firm.client_invite_tokens IS
  'Firm 开放邀请入口：携带 firm_space + inviter_user + sku 的 token，用于 client-join 流程';

-- ------------------------------------------------------------
-- 3. firm.orders：Firm → Client 的服务订单（按 SKU）
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'firm.orders'::regclass
      AND contype = 'u'
      AND conname = 'firm_orders_unique_active_per_sku'
  ) THEN
    ALTER TABLE firm.orders
      ADD CONSTRAINT firm_orders_unique_active_per_sku
      UNIQUE (firm_space_id, client_space_id, sku_id, status);
  END IF;
END $$;

COMMENT ON TABLE firm.orders IS
  'Firm 对 Client 的服务订单，按 SKU 记录，一对 firm_space + client_space + sku 在同一 status 下最多有一条记录（active 只应有一条）';

-- ------------------------------------------------------------
-- 3.1 firm.member_clients：为每个 client 维护 assignee（仅补唯一约束）
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'firm.member_clients'::regclass
      AND contype = 'u'
      AND conname = 'firm_member_clients_unique'
  ) THEN
    ALTER TABLE firm.member_clients
      ADD CONSTRAINT firm_member_clients_unique
      UNIQUE (firm_space_id, user_id, client_space_id);
  END IF;
END $$;

COMMENT ON TABLE firm.member_clients IS
  'Firm 成员与 Client 的分配关系：用于维护 assignee；一名成员对同一 client 仅一条记录';

-- ------------------------------------------------------------
-- 4. 业务函数：消费开放邀请 token，创建/恢复 client 关系与订单
-- 前端建议使用：
--   SELECT * FROM firm.accept_client_invite_token(p_token, p_client_space_id, p_client_user_id);
-- 该函数会：
--   1) 校验 token 是否存在/有效
--   2) 在 firm.clients 中 upsert 一条 active 关系（assignee = inviter_user_id）
--   3) 在 firm.orders 中为该 SKU 创建/恢复一条 active 订单
--   4) 更新 token 的 current_clients / 自动失效
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION firm.accept_client_invite_token(
  p_token text,
  p_client_space_id uuid,
  p_client_user_id uuid
)
RETURNS TABLE (
  firm_space_id uuid,
  client_space_id uuid,
  inviter_user_id uuid,
  sku_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = firm, public
AS $$
DECLARE
  v_token_record firm.client_invite_tokens%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF p_token IS NULL OR p_client_space_id IS NULL OR p_client_user_id IS NULL THEN
    RAISE EXCEPTION 'token, client_space_id and client_user_id are required'
      USING ERRCODE = '22023';
  END IF;

  -- 1) 获取并校验 token
  SELECT *
  INTO v_token_record
  FROM firm.client_invite_tokens
  WHERE token = p_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid client invite token'
      USING ERRCODE = '22023';
  END IF;

  IF v_token_record.is_active IS FALSE THEN
    RAISE EXCEPTION 'Client invite token is inactive'
      USING ERRCODE = '22023';
  END IF;

  IF v_token_record.expires_at IS NOT NULL
     AND v_token_record.expires_at <= v_now THEN
    RAISE EXCEPTION 'Client invite token has expired'
      USING ERRCODE = '22023';
  END IF;

  IF v_token_record.max_clients IS NOT NULL
     AND v_token_record.current_clients >= v_token_record.max_clients THEN
    RAISE EXCEPTION 'Client invite token has reached its maximum usage'
      USING ERRCODE = '22023';
  END IF;

  -- 2) 在 firm.clients 中 upsert 关系（仅 firm_space_id ↔ client_space_id + status）
  INSERT INTO firm.clients (firm_space_id, client_space_id, status)
  VALUES (
    v_token_record.firm_space_id,
    p_client_space_id,
    'active'
  )
  ON CONFLICT (firm_space_id, client_space_id)
  DO UPDATE SET
    status = 'active'
  WHERE firm.clients.status <> 'active';

  -- 2.1) 在 firm.member_clients 中为 inviter 建立 assignee 关系（如不存在则插入）
  INSERT INTO firm.member_clients (firm_space_id, user_id, client_space_id, created_at)
  VALUES (
    v_token_record.firm_space_id,
    v_token_record.inviter_user_id,
    p_client_space_id,
    v_now
  )
  ON CONFLICT (firm_space_id, user_id, client_space_id)
  DO NOTHING;

  -- 3) 在 firm.orders 中为该 SKU 创建/恢复 active 订单
  INSERT INTO firm.orders (firm_space_id, client_space_id, sku_id, status, due_at, created_at, updated_at, created_by)
  VALUES (
    v_token_record.firm_space_id,
    p_client_space_id,
    v_token_record.sku_id,
    'active',
    NULL,
    v_now,
    v_now,
    p_client_user_id
  )
  ON CONFLICT (firm_space_id, client_space_id, sku_id, status)
  DO NOTHING;

  -- 4) 更新 token 用量
  UPDATE firm.client_invite_tokens
  SET current_clients = current_clients + 1,
      is_active = CASE
        WHEN max_clients IS NOT NULL AND current_clients + 1 >= max_clients THEN FALSE
        ELSE is_active
      END
  WHERE id = v_token_record.id;

  firm_space_id  := v_token_record.firm_space_id;
  client_space_id := p_client_space_id;
  inviter_user_id := v_token_record.inviter_user_id;
  sku_id          := v_token_record.sku_id;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION firm.accept_client_invite_token(text, uuid, uuid) IS
  '开放邀请：消费 firm.client_invite_tokens.token，为指定 client_space 建立 firm.clients + firm.orders 记录';

