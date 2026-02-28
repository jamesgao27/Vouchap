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
};

export const TODO_STATUS_COLOR: Record<string, string> = {
  action_required: '#E74C3C',   // 红
  missing_info: '#E67E22',     // 橙
  under_review: '#3498DB',    // 蓝
  flagged: '#9B59B6',         // 紫
  success: '#27AE60',         // 绿
};
