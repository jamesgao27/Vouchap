/**
 * 待办/任务状态 UI：Action Required, Missing Info, Under Review, Flagged, Success
 * 与 public.project_todos.status 及 ProjectTodoStatus 类型一致
 */
export const TODO_STATUS_LABEL: Record<string, string> = {
  action_required: 'Action Required',
  missing_info: 'Missing Info',
  under_review: 'Under Review',
  flagged: 'Flagged',
  success: 'Success',
  canceled: 'Canceled',
};

/** 状态标签背景色（原设计 + 一点透明度） */
export const TODO_STATUS_COLOR: Record<string, string> = {
  action_required: 'rgba(231, 76, 60, 0.7)',   // 红
  missing_info: 'rgba(230, 126, 34, 0.7)',     // 橙
  under_review: 'rgba(52, 152, 219, 0.7)',     // 蓝
  flagged: 'rgba(155, 89, 182, 0.7)',          // 紫
  success: 'rgba(39, 174, 96, 0.7)',            // 绿
  canceled: 'rgba(149, 165, 166, 0.7)',         // 灰，已终止
};
