-- 合并逻辑已改为各表上的 merged_into_id 字段，合并历史表可安全删除
-- 执行前请确认已运行 merge-via-merged-into-id.sql 且应用运行正常

DROP TABLE IF EXISTS customer_merge_history;
DROP TABLE IF EXISTS supplier_merge_history;
DROP TABLE IF EXISTS account_merge_history;
