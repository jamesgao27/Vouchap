-- 聊天窗历史记录增加「记录类别」，兼容历史数据（空值为 receipt）
-- 四种列表页的增加按钮（拍照/聊天）提交后由大模型按当前类型识别，不由大模型判断类别

-- 为 ai_chat_logs 表添加 voucher_type 字段
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_chat_logs' AND column_name = 'voucher_type'
  ) THEN
    ALTER TABLE ai_chat_logs
    ADD COLUMN voucher_type TEXT NULL DEFAULT NULL;
    COMMENT ON COLUMN ai_chat_logs.voucher_type IS '记录类别: receipt|invoice|inbound|outbound，空表示历史数据即 receipt';
  END IF;
END $$;

-- 可选：为按类型查询建索引
CREATE INDEX IF NOT EXISTS idx_ai_chat_logs_voucher_type ON ai_chat_logs(voucher_type);
