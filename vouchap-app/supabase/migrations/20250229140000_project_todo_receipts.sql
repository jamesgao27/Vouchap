-- 关联 project_todos（任务）与 receipts（上传/AI 匹配的文件），用于在任务下展示文件列表，点击进入 receipt 详情
CREATE TABLE IF NOT EXISTS public.project_todo_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_todo_id UUID NOT NULL REFERENCES public.project_todos(id) ON DELETE CASCADE,
  receipt_id UUID NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_todo_id, receipt_id)
);

CREATE INDEX IF NOT EXISTS idx_project_todo_receipts_todo ON public.project_todo_receipts(project_todo_id);
CREATE INDEX IF NOT EXISTS idx_project_todo_receipts_receipt ON public.project_todo_receipts(receipt_id);

ALTER TABLE public.project_todo_receipts ENABLE ROW LEVEL SECURITY;

-- 与 project_todos 一致：通过 project 的 client_space_id / firm_space_id 授权；且 receipt 须属于该 client_space
CREATE POLICY project_todo_receipts_select ON public.project_todo_receipts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_todos pt
      JOIN public.projects p ON p.id = pt.project_id
      JOIN public.receipts r ON r.id = project_todo_receipts.receipt_id
      WHERE pt.id = project_todo_receipts.project_todo_id
        AND (p.client_space_id = r.space_id OR p.firm_space_id = r.space_id)
        AND EXISTS (
          SELECT 1 FROM public.user_spaces us
          WHERE us.user_id = auth.uid() AND (us.space_id = p.client_space_id OR us.space_id = p.firm_space_id)
        )
    )
  );

CREATE POLICY project_todo_receipts_insert ON public.project_todo_receipts FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_todos pt
      JOIN public.projects p ON p.id = pt.project_id
      JOIN public.receipts r ON r.id = receipt_id
      WHERE pt.id = project_todo_id
        AND (p.client_space_id = r.space_id OR p.firm_space_id = r.space_id)
        AND EXISTS (
          SELECT 1 FROM public.user_spaces us
          WHERE us.user_id = auth.uid() AND (us.space_id = p.client_space_id OR us.space_id = p.firm_space_id)
        )
    )
  );

CREATE POLICY project_todo_receipts_delete ON public.project_todo_receipts FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_todos pt
      JOIN public.projects p ON p.id = pt.project_id
      WHERE pt.id = project_todo_receipts.project_todo_id
        AND EXISTS (
          SELECT 1 FROM public.user_spaces us
          WHERE us.user_id = auth.uid() AND (us.space_id = p.client_space_id OR us.space_id = p.firm_space_id)
        )
    )
  );

COMMENT ON TABLE public.project_todo_receipts IS '任务关联的文件（收据/凭证）；上传或 AI 匹配后关联到 project_todo';
