/**
 * Firm 服务端功能：客户管理、订单/SKU/项目、跟进记录等。
 * 数据表在 Supabase schema "firm" 下。
 * 客户展示状态见 docs/CRM-CLIENT-STATUS.md；订单/SKU/项目见 docs/CRM-ORDERS-SKU-PROJECTS.md。
 */
import { supabase } from './supabase';
import type {
  FirmClient,
  FirmClientStatus,
  ClientDisplayStatus,
  FirmClientTodo,
  FirmClientFollowUp,
  FirmOrder,
  FirmProject,
  FirmOrderStatus,
  ProjectTodoStatus,
  FirmSku,
  FirmSkuItem,
  FirmTemplate,
} from '@/types';

/** sort_order 为「同 parent 兄弟排序」时，按树深度优先得到展示顺序（用于列表与复制到 project_todos） */
function sortSkuItemsDepthFirst<
  T extends { id: string; parentId?: string | null; sortOrder: number }
>(items: T[]): T[] {
  if (items.length === 0) return [];
  const byParent = new Map<string | null, T[]>();
  for (const item of items) {
    const key = item.parentId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(item);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
  const result: T[] = [];
  function dfs(parentKey: string | null) {
    const list = byParent.get(parentKey) ?? [];
    for (const item of list) {
      result.push(item);
      dfs(item.id);
    }
  }
  dfs(null);
  return result;
}

/** 报税季配置：开始/结束月日（1-based），用于计算「报税季已来临」「报税季已过」 */
const TAX_SEASON_START_MONTH = 1;
const TAX_SEASON_START_DAY = 1;
const TAX_SEASON_END_MONTH = 4;
const TAX_SEASON_END_DAY = 30;

function getTaxSeasonContext(): { currentYear: number; lastYear: number; taxSeasonStarted: boolean; taxSeasonEnded: boolean } {
  const now = new Date();
  const currentYear = now.getFullYear();
  const lastYear = currentYear - 1;
  const start = new Date(currentYear, TAX_SEASON_START_MONTH - 1, TAX_SEASON_START_DAY);
  const end = new Date(currentYear, TAX_SEASON_END_MONTH - 1, TAX_SEASON_END_DAY);
  const taxSeasonStarted = now >= start;
  const taxSeasonEnded = now > end;
  return { currentYear, lastYear, taxSeasonStarted, taxSeasonEnded };
}

/** 订单所属年度：优先 due_at 年份，否则 created_at 年份 */
function getOrderYear(order: { dueAt?: string | null; createdAt?: string | null }): number {
  const d = order.dueAt || order.createdAt;
  if (!d) return new Date().getFullYear();
  return new Date(d).getFullYear();
}

/** 根据订单列表与报税季上下文计算客户展示状态（code 使用英文，UI 可自行映射文案）
 *  优先级：new → churned → in_service → to_follow_up → to_revisit
 */
function computeClientDisplayStatus(
  clientSpaceId: string,
  orders: Array<{ clientSpaceId: string; status: string; dueAt?: string | null; createdAt?: string | null }>,
  ctx: { currentYear: number; lastYear: number; taxSeasonStarted: boolean; taxSeasonEnded: boolean }
): ClientDisplayStatus {
  const clientOrders = orders.filter((o) => o.clientSpaceId === clientSpaceId);
  const hasAnyOrder = clientOrders.length > 0;
  const currentYearOrders = clientOrders.filter((o) => getOrderYear(o) === ctx.currentYear);
  const lastYearOrders = clientOrders.filter((o) => getOrderYear(o) === ctx.lastYear);
  const hasCurrentYearInProgress = currentYearOrders.some((o) =>
    o.status === 'onboarding' || o.status === 'collecting' || o.status === 'processing' ||
    o.status === 'reviewing' || o.status === 'filing'
  );
  const hasLastYearCompleted = lastYearOrders.some((o) => o.status === 'completed');

  if (!hasAnyOrder) return 'new';
  if (ctx.taxSeasonEnded && !hasCurrentYearInProgress) return 'churned';
  if (hasCurrentYearInProgress) return 'in_service';
  if (ctx.taxSeasonStarted && !hasCurrentYearInProgress) return 'to_follow_up';
  if (hasLastYearCompleted) return 'to_revisit';
  return 'to_follow_up';
}

/** 客户端空间：获取推送给本空间的待办（订单阶段为 onboarding..filing 即有 project 的） */
export async function getClientTodosForClientSpace(clientSpaceId: string): Promise<FirmClientTodo[]> {
  const { data: ordersData, error: ordersErr } = await supabase
    .schema('firm')
    .from('orders')
    .select('id, firm_space_id, client_space_id, due_at, created_at')
    .eq('client_space_id', clientSpaceId)
    .in('status', ['onboarding', 'collecting', 'processing', 'reviewing', 'filing'])
    .order('due_at', { ascending: true, nullsFirst: false });

  if (ordersErr || !ordersData?.length) {
    if (ordersErr) console.error('getClientTodosForClientSpace orders:', ordersErr);
    return [];
  }

  const orderIds = ordersData.map((o: any) => o.id);
  const { data: projectsData } = await supabase.from('projects').select('id, order_id').in('order_id', orderIds);
  const projectIds = (projectsData || []).map((p: any) => p.id);
  const orderIdByProjectId: Record<string, string> = {};
  (projectsData || []).forEach((p: any) => { orderIdByProjectId[p.id] = p.order_id; });
  if (projectIds.length === 0) return [];
  const { data: itemsData, error: itemsErr } = await supabase
    .from('project_todos')
    .select('*')
    .in('project_id', projectIds)
    .eq('type', 'client')
    .order('sort_order', { ascending: true });

  if (itemsErr) {
    console.error('getClientTodosForClientSpace projects:', itemsErr);
    return [];
  }

  const orderMap: Record<string, any> = {};
  ordersData.forEach((o: any) => { orderMap[o.id] = o; });

  return (itemsData || []).map((row: any) => {
    const orderId = orderIdByProjectId[row.project_id];
    const order = orderMap[orderId];
    return {
      id: row.id,
      orderId: orderId ?? row.project_id,
      firmSpaceId: order?.firm_space_id ?? '',
      clientSpaceId: order?.client_space_id ?? '',
      title: row.title,
      description: row.description ?? null,
      dueAt: order?.due_at ?? null,
      status: row.status,
      sortOrder: row.sort_order ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

/** 客户端订单列表项：确认前用 SKU 展示，确认后用 project 展示 */
export interface FirmOrderForClient extends FirmOrder {
  skuName?: string;
  skuDescription?: string | null;
  skuImageUrl?: string | null;
  projectName?: string;
  projectDescription?: string | null;
  projectImageUrl?: string | null;
  /** 确认后项目任务完成数/总数（用于列表进度展示） */
  taskCompleted?: number;
  taskTotal?: number;
  /** Firm 空间名称（来自 public.spaces），用于卡片展示 */
  firmName?: string;
}

/** 单笔订单（用于详情页） */
export interface FirmOrderById {
  id: string;
  firmSpaceId: string;
  clientSpaceId: string;
  skuId: string;
  status: string;
  dueAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** 根据 orderId 获取订单（用于 engagement 详情） */
export async function getOrderById(orderId: string): Promise<FirmOrderById | null> {
  const { data, error } = await supabase
    .schema('firm')
    .from('orders')
    .select('id, firm_space_id, client_space_id, sku_id, status, due_at, created_at, updated_at')
    .eq('id', orderId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as any;
  return {
    id: row.id,
    firmSpaceId: row.firm_space_id,
    clientSpaceId: row.client_space_id,
    skuId: row.sku_id,
    status: row.status ?? 'onboarding',
    dueAt: row.due_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 订单顶行展示（与列表页卡片一致）：projectName、firmName、dueAt、createdAt，用于 todos/info 页顶栏；税季用 dueAt ?? createdAt */
export async function getOrderHeaderForClient(orderId: string): Promise<{
  projectName: string;
  firmName: string;
  dueAt: string | null;
  createdAt: string | null;
  status: string;
} | null> {
  const order = await getOrderById(orderId);
  if (!order) return null;
  const isOnboarding = order.status === 'onboarding';
  let projectName = 'Service order';
  let firmName = '';
  if (!isOnboarding) {
    const [project, spaceRow] = await Promise.all([
      getProjectByOrderId(orderId),
      order.firmSpaceId
        ? supabase.from('spaces').select('name').eq('id', order.firmSpaceId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    projectName = project?.name ?? 'Project';
    firmName = (spaceRow.data as any)?.name ?? '';
  } else {
    const sku = await getSkuById(order.skuId);
    if (sku) projectName = sku.name;
    if (order.firmSpaceId) {
      const { data: spaceRow } = await supabase.from('spaces').select('name').eq('id', order.firmSpaceId).maybeSingle();
      firmName = (spaceRow as any)?.name ?? '';
    }
  }
  return {
    projectName,
    firmName,
    dueAt: order.dueAt ?? null,
    createdAt: order.createdAt ?? null,
    status: order.status,
  };
}

/** 根据 skuId 获取 SKU 基本信息（名称、说明、封面），用于详情展示 */
export async function getSkuById(skuId: string): Promise<{ name: string; description?: string | null; imageUrl?: string | null } | null> {
  const { data, error } = await supabase
    .schema('firm')
    .from('skus')
    .select('name, description, image_url')
    .eq('id', skuId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as any;
  return {
    name: row.name ?? '',
    description: row.description ?? null,
    imageUrl: row.image_url ?? null,
  };
}

/** 客户端空间：获取本空间的所有订单；附带 sku 与 project（确认后有 project）用于展示 */
export async function getClientOrdersForClientSpace(clientSpaceId: string): Promise<FirmOrderForClient[]> {
  const { data: ordersData, error: ordersErr } = await supabase
    .schema('firm')
    .from('orders')
    .select('*')
    .eq('client_space_id', clientSpaceId)
    .order('created_at', { ascending: false });

  if (ordersErr || !ordersData?.length) {
    if (ordersErr) console.error('getClientOrdersForClientSpace orders:', ordersErr);
    return [];
  }

  const orderIds = ordersData.map((o: any) => o.id);
  const skuIds = Array.from(new Set(ordersData.map((o: any) => o.sku_id)));

  const [skusRes, projectsRes] = await Promise.all([
    supabase.schema('firm').from('skus').select('id, name, description, image_url').in('id', skuIds),
    supabase.from('projects').select('id, order_id, name, description, image_url').in('order_id', orderIds),
  ]);

  const skuMap: Record<string, { name: string; description?: string | null; image_url?: string | null }> = {};
  (skusRes.data || []).forEach((s: any) => {
    skuMap[s.id] = { name: s.name || '', description: s.description ?? null, image_url: s.image_url ?? null };
  });
  const projectsList = (projectsRes.data || []) as any[];
  const projectByOrderId: Record<string, { id: string; name: string; description?: string | null; image_url?: string | null }> = {};
  projectsList.forEach((p: any) => {
    projectByOrderId[p.order_id] = { id: p.id, name: p.name || '', description: p.description ?? null, image_url: p.image_url ?? null };
  });
  const projectIds = projectsList.map((p: any) => p.id);
  let todoCountByProjectId: Record<string, { total: number; completed: number }> = {};
  if (projectIds.length > 0) {
    const { data: todosData } = await supabase.from('project_todos').select('project_id, status, item_kind').in('project_id', projectIds);
    (todosData || []).forEach((t: any) => {
      const isTask = (t.item_kind ?? 'task') === 'task';
      if (!isTask) return;
      if (!todoCountByProjectId[t.project_id]) todoCountByProjectId[t.project_id] = { total: 0, completed: 0 };
      todoCountByProjectId[t.project_id].total += 1;
      if (t.status === 'success') todoCountByProjectId[t.project_id].completed += 1;
    });
  }

  const firmSpaceIds = Array.from(new Set((ordersData || []).map((o: any) => o.firm_space_id).filter(Boolean)));
  const spaceNameByFirmSpaceId: Record<string, string> = {};
  if (firmSpaceIds.length > 0) {
    const { data: spacesData } = await supabase.from('spaces').select('id, name').in('id', firmSpaceIds);
    (spacesData || []).forEach((s: any) => {
      spaceNameByFirmSpaceId[s.id] = s.name ?? '';
    });
  }

  return (ordersData || []).map((row: any) => {
    const sku = skuMap[row.sku_id];
    const project = projectByOrderId[row.id];
    const counts = project ? todoCountByProjectId[project.id] : undefined;
    return {
      id: row.id,
      firmSpaceId: row.firm_space_id,
      clientSpaceId: row.client_space_id,
      skuId: row.sku_id,
      status: row.status,
      dueAt: row.due_at ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      createdBy: row.created_by ?? null,
      skuName: sku?.name ?? undefined,
      skuDescription: sku?.description ?? undefined,
      skuImageUrl: sku?.image_url ?? undefined,
      projectName: project?.name ?? undefined,
      projectDescription: project?.description ?? undefined,
      projectImageUrl: project?.image_url ?? undefined,
      taskTotal: counts?.total,
      taskCompleted: counts?.completed,
      firmName: spaceNameByFirmSpaceId[row.firm_space_id] || undefined,
    };
  });
}

/** Firm 空间：获取在服客户列表 */
export async function getFirmClients(firmSpaceId: string): Promise<FirmClient[]> {
  const { data, error } = await supabase
    .schema('firm')
    .from('clients')
    .select('*')
    .eq('firm_space_id', firmSpaceId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getFirmClients:', error);
    return [];
  }
  return (data || []).map((row: any) => ({
    id: row.id,
    firmSpaceId: row.firm_space_id,
    clientSpaceId: row.client_space_id,
    displayName: row.display_name,
    status: row.status ?? 'active',
    // assignee 与最近跟进时间不再由 clients 表字段维护，由 member_clients / client_follow_ups 计算
    assignedUserId: null,
    lastFollowUpAt: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/** 列表项：关联的 client，含名称、联系人、服务负责人、自动计算状态、最近跟进时间等 */
export interface FirmClientWithDetails extends FirmClient {
  /** 名称：display_name 或 client 空间名称 */
  name: string;
  /** 联系人：client 空间管理员名称 */
  contactName: string | null;
  /** 联系人 email */
  contactEmail: string | null;
  /** 开始服务时间（关联时间） */
  serviceStartAt: string | null;
  /** 自动计算的状态标签（见 docs/CRM-CLIENT-STATUS.md） */
  displayStatus: ClientDisplayStatus;
  /** 服务负责人姓名（来自 member_clients，多人时拼接） */
  assigneeName: string | null;
  /** 服务负责人 email（多人时取第一个） */
  assigneeEmail: string | null;
}

/** Firm 空间：获取在服客户列表（含名称、联系人、服务负责人来自 member_clients、自动计算 displayStatus、最近跟进时间） */
export async function getFirmClientsWithDetails(firmSpaceId: string): Promise<FirmClientWithDetails[]> {
  const clients = await getFirmClients(firmSpaceId);
  if (clients.length === 0) return [];

  const spaceIds = [...new Set(clients.map((c) => c.clientSpaceId))];
  const ctx = getTaxSeasonContext();

  const [spacesRes, userSpacesRes, ordersRes, memberClientsRes, followUpsRes] = await Promise.all([
    supabase.from('spaces').select('id, name').in('id', spaceIds),
    supabase.from('user_spaces').select('space_id, user_id').in('space_id', spaceIds).eq('is_admin', true),
    supabase.schema('firm').from('orders').select('client_space_id, status, due_at, created_at').eq('firm_space_id', firmSpaceId),
    supabase.schema('firm').from('member_clients').select('client_space_id, user_id').eq('firm_space_id', firmSpaceId),
    supabase
      .schema('firm')
      .from('client_follow_ups')
      .select('client_space_id, firm_space_id, created_at')
      .eq('firm_space_id', firmSpaceId),
  ]);

  const spaceMap: Record<string, { name: string }> = {};
  (spacesRes.data || []).forEach((s: any) => {
    spaceMap[s.id] = { name: s.name || '' };
  });

  const spaceToUserId: Record<string, string> = {};
  (userSpacesRes.data || []).forEach((us: any) => {
    if (!spaceToUserId[us.space_id]) spaceToUserId[us.space_id] = us.user_id;
  });

  const orders = (ordersRes.data || []).map((r: any) => ({
    clientSpaceId: r.client_space_id,
    status: r.status,
    dueAt: r.due_at,
    createdAt: r.created_at,
  }));

  const clientSpaceToUserIds: Record<string, string[]> = {};
  (memberClientsRes.data || []).forEach((mc: any) => {
    if (!clientSpaceToUserIds[mc.client_space_id]) clientSpaceToUserIds[mc.client_space_id] = [];
    if (!clientSpaceToUserIds[mc.client_space_id].includes(mc.user_id)) {
      clientSpaceToUserIds[mc.client_space_id].push(mc.user_id);
    }
  });

  // 每个 client_space 的最近一次跟进时间（max created_at）
  const clientSpaceToLastFollowUp: Record<string, string> = {};
  (followUpsRes.data || []).forEach((fu: any) => {
    const csId = fu.client_space_id;
    const createdAt: string | null = fu.created_at ?? null;
    if (!createdAt) return;
    const prev = clientSpaceToLastFollowUp[csId];
    if (!prev || new Date(createdAt) > new Date(prev)) {
      clientSpaceToLastFollowUp[csId] = createdAt;
    }
  });

  const contactUserIds = [...new Set(Object.values(spaceToUserId))];
  const assigneeUserIds = [...new Set((memberClientsRes.data || []).map((mc: any) => mc.user_id))];
  const allUserIds = [...new Set([...contactUserIds, ...assigneeUserIds])];
  let userMap: Record<string, { name: string | null; email: string }> = {};
  if (allUserIds.length > 0) {
    const usersRes = await supabase.from('users').select('id, name, email').in('id', allUserIds);
    (usersRes.data || []).forEach((u: any) => {
      userMap[u.id] = { name: u.name || null, email: u.email || '' };
    });
  }

  return clients.map((c) => {
    const space = spaceMap[c.clientSpaceId];
    const contactUserId = spaceToUserId[c.clientSpaceId];
    const contactUser = contactUserId ? userMap[contactUserId] : null;
    const assigneeIds = clientSpaceToUserIds[c.clientSpaceId] || [];
    const assigneeNames = assigneeIds.map((id) => userMap[id]?.name).filter(Boolean) as string[];
    const assigneeName = assigneeNames.length > 0 ? assigneeNames.join('、') : null;
    const assigneeEmailVal = assigneeIds[0] ? (userMap[assigneeIds[0]]?.email ?? null) : null;
    const displayStatus = computeClientDisplayStatus(c.clientSpaceId, orders, ctx);
    return {
      ...c,
      assignedUserId: assigneeIds[0] ?? null,
      lastFollowUpAt: clientSpaceToLastFollowUp[c.clientSpaceId] ?? null,
      name: c.displayName?.trim() || space?.name || c.clientSpaceId,
      contactName: contactUser?.name ?? null,
      contactEmail: contactUser?.email ?? null,
      serviceStartAt: c.createdAt ?? null,
      displayStatus,
      assigneeName,
      assigneeEmail: assigneeEmailVal,
    };
  });
}

/** Firm 空间：获取订单列表（可选按客户筛选） */
export async function getFirmOrders(
  firmSpaceId: string,
  clientSpaceId?: string
): Promise<FirmOrder[]> {
  let q = supabase
    .schema('firm')
    .from('orders')
    .select('*')
    .eq('firm_space_id', firmSpaceId);
  if (clientSpaceId) q = q.eq('client_space_id', clientSpaceId);
  const { data, error } = await q.order('due_at', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });

  if (error) {
    console.error('getFirmOrders:', error);
    return [];
  }
  return (data || []).map((row: any) => ({
    id: row.id,
    firmSpaceId: row.firm_space_id,
    clientSpaceId: row.client_space_id,
    skuId: row.sku_id,
    status: row.status,
    dueAt: row.due_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by ?? null,
  }));
}

/** 列表项：订单含客户名、SKU 名、来源、负责人（创建人） */
export interface FirmOrderWithDetails extends FirmOrder {
  clientName: string;
  skuName: string;
  /** 来源：如 Manual、Invite 等，暂无 DB 字段时默认 Manual */
  source: string;
  /** 负责人：创建人姓名或 email，无则 — */
  assigneeName: string | null;
}

/** Firm 空间：获取订单列表（含客户名、SKU 名、来源、负责人），用于表格展示 */
export async function getFirmOrdersWithDetails(
  firmSpaceId: string,
  clientSpaceId?: string
): Promise<FirmOrderWithDetails[]> {
  const orders = await getFirmOrders(firmSpaceId, clientSpaceId);
  if (orders.length === 0) return [];

  const clientSpaceIds = [...new Set(orders.map((o) => o.clientSpaceId))];
  const skuIds = [...new Set(orders.map((o) => o.skuId))];
  const createdByIds = [...new Set(orders.map((o) => o.createdBy).filter(Boolean))] as string[];

  const [spacesRes, skusRes, usersRes] = await Promise.all([
    supabase.from('spaces').select('id, name').in('id', clientSpaceIds),
    supabase.schema('firm').from('skus').select('id, name').in('id', skuIds),
    createdByIds.length > 0
      ? supabase.from('users').select('id, name, email').in('id', createdByIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const spaceMap: Record<string, string> = {};
  (spacesRes.data || []).forEach((s: any) => {
    spaceMap[s.id] = s.name || s.id;
  });
  const skuMap: Record<string, string> = {};
  (skusRes.data || []).forEach((s: any) => {
    skuMap[s.id] = s.name || s.id;
  });
  const userMap: Record<string, { name: string | null; email: string }> = {};
  (usersRes.data || []).forEach((u: any) => {
    userMap[u.id] = { name: u.name ?? null, email: u.email || '' };
  });

  return orders.map((o) => {
    const creator = o.createdBy ? userMap[o.createdBy] : null;
    const assigneeName = creator ? (creator.name || creator.email || null) : null;
    return {
      ...o,
      clientName: spaceMap[o.clientSpaceId] ?? o.clientSpaceId,
      skuName: skuMap[o.skuId] ?? o.skuId,
      source: 'Manual',
      assigneeName,
    };
  });
}

/** Firm 空间：创建订单（初始为 onboarding，仅记录 SKU，projects 需待客户确认后再创建） */
export async function createFirmOrder(
  firmSpaceId: string,
  clientSpaceId: string,
  skuId: string,
  dueAt: string | null = null
): Promise<{ id: string | null; error: Error | null }> {
  const { data: user } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .schema('firm')
    .from('orders')
    .insert({
      firm_space_id: firmSpaceId,
      client_space_id: clientSpaceId,
      sku_id: skuId,
      status: 'onboarding',
      due_at: dueAt,
      created_by: user.user?.id ?? null,
    })
    .select('id')
    .single();

  if (error) {
    return { id: null, error: error as Error };
  }
  return { id: (data as any)?.id ?? null, error: null };
}

/** 客户端确认订单：复制 sku -> project，复制 sku_items -> project_todos，并将订单标记为 collecting（资料中） */
export async function confirmOrderAndCreateProjectTodos(
  orderId: string
): Promise<{ error: Error | null }> {
  const { data: order, error: orderErr } = await supabase
    .schema('firm')
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (orderErr || !order) {
    return { error: orderErr ? new Error(orderErr.message) : new Error('Order not found') };
  }

  const { data: sku, error: skuErr } = await supabase
    .schema('firm')
    .from('skus')
    .select('id, name, description, image_url')
    .eq('id', order.sku_id)
    .single();

  if (skuErr || !sku) {
    return { error: skuErr ? new Error(skuErr.message) : new Error('SKU not found') };
  }

  const { data: projectRow, error: projectErr } = await supabase
    .from('projects')
    .insert({
      firm_space_id: (order as any).firm_space_id,
      client_space_id: (order as any).client_space_id,
      order_id: order.id,
      name: (sku as any).name ?? 'Project',
      description: (sku as any).description ?? null,
      image_url: (sku as any).image_url ?? null,
    })
    .select('id')
    .maybeSingle();

  let projectId: string | null = projectRow?.id ?? null;
  if (projectErr) {
    if (projectErr.code === '23505') {
      // unique_violation: project already exists, fetch id by order_id
      const { data: existing } = await supabase.from('projects').select('id').eq('order_id', order.id).maybeSingle();
      projectId = (existing as any)?.id ?? null;
    } else {
      return { error: new Error(projectErr.message) };
    }
  }
  if (!projectId) return { error: new Error('Project not created') };

  const { data: items, error: itemsErr } = await supabase
    .schema('firm')
    .from('sku_items')
    .select('*')
    .eq('sku_id', order.sku_id);

  if (itemsErr) {
    return { error: new Error(itemsErr.message) };
  }

  if (items && items.length > 0) {
    const ordered = sortSkuItemsDepthFirst(
      items.map((row: any) => ({
        id: row.id,
        parentId: row.parent_id ?? null,
        sortOrder: row.sort_order ?? 0,
        item_kind: row.item_kind ?? 'task',
        type: row.type,
        title: row.title,
        description: row.description ?? null,
      }))
    );
    // 完整复制树形结构：phase、section、task 全部复制，parent_id 为直接父节点新 id
    const oldIdToNewId = new Map<string, string>();
    for (let i = 0; i < ordered.length; i++) {
      const row = ordered[i];
      const parent_id = row.parentId ? oldIdToNewId.get(row.parentId) ?? null : null;
      const isTask = (row.item_kind ?? 'task') === 'task';
      const status: ProjectTodoStatus = isTask ? 'action_required' : 'success';
      const itemKind = (row.item_kind ?? 'task') as 'phase' | 'section' | 'task';
      const { data: inserted, error: insertErr } = await supabase
        .from('project_todos')
        .insert({
          project_id: projectId,
          parent_id: parent_id,
          type: row.type,
          title: row.title,
          description: row.description ?? null,
          status,
          sort_order: i + 1,
          item_kind: itemKind,
        })
        .select('id')
        .single();
      if (insertErr) return { error: new Error(insertErr.message) };
      const newId = (inserted as any)?.id;
      if (newId) oldIdToNewId.set(row.id, newId);
    }
  }

  const { error: updateErr } = await updateOrderStatus(orderId, 'collecting');
  return { error: updateErr };
}

/** 项目信息（与 SKU 结构一致，用于详情展示） */
export interface FirmProjectInfo {
  id: string;
  orderId: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  status?: string;
  startAt?: string | null;
  endAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** 根据 orderId 获取 project 信息（确认订单后才有） */
export async function getProjectByOrderId(orderId: string): Promise<FirmProjectInfo | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, order_id, name, description, image_url, status, start_at, end_at, created_at, updated_at')
    .eq('order_id', orderId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as any;
  return {
    id: row.id,
    orderId: row.order_id,
    name: row.name ?? '',
    description: row.description ?? null,
    imageUrl: row.image_url ?? null,
    status: row.status ?? 'in_progress',
    startAt: row.start_at ?? null,
    endAt: row.end_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 根据 orderId 解析 project_id（public.projects 按 order_id 唯一） */
async function getProjectIdByOrderId(orderId: string): Promise<string | null> {
  const { data } = await supabase.from('projects').select('id').eq('order_id', orderId).maybeSingle();
  return (data as any)?.id ?? null;
}

/** 获取某订单对应项目的 project_todos（扁平列表，含 parent_id） */
export async function getOrderProjects(orderId: string): Promise<FirmProject[]> {
  const projectId = await getProjectIdByOrderId(orderId);
  if (!projectId) return [];
  const { data, error } = await supabase
    .from('project_todos')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('getOrderProjects:', error);
    return [];
  }
  return (data || []).map((row: any) => ({
    id: row.id,
    orderId: orderId,
    type: row.type,
    title: row.title,
    description: row.description ?? null,
    status: row.status,
    sortOrder: row.sort_order ?? 0,
    parentId: row.parent_id ?? null,
    itemKind: row.item_kind ?? 'task',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/** 项目任务树节点（WBS）；排序与 SKU-items 一致：同级按 sort_order */
export interface ProjectTodoNode {
  id: string;
  orderId: string;
  parentId: string | null;
  type: FirmProject['type'];
  title: string;
  description?: string | null;
  status: FirmProject['status'];
  sortOrder: number;
  depth: number;
  /** phase / section / task；仅 task 可关联文件 */
  itemKind: 'phase' | 'section' | 'task';
  children: ProjectTodoNode[];
  createdAt?: string;
  updatedAt?: string;
}

/** 获取某订单的 project_todos 树形结构（深度优先） */
export async function getProjectTodosTree(orderId: string): Promise<ProjectTodoNode[]> {
  const flat = await getOrderProjects(orderId);
  const withParent = flat as (FirmProject & { parentId?: string | null })[];
  const byParent = new Map<string | null, (typeof withParent)[0][]>();
  for (const item of withParent) {
    const key = item.parentId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(item);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
  function buildChildren(parentKey: string | null, depth: number): ProjectTodoNode[] {
    const list = byParent.get(parentKey) ?? [];
    return list.map((item) => ({
      id: item.id,
      orderId: item.orderId,
      parentId: item.parentId ?? null,
      type: item.type,
      title: item.title,
      description: item.description ?? null,
      status: item.status,
      sortOrder: item.sortOrder,
      depth,
      itemKind: (item as any).itemKind ?? 'task',
      children: buildChildren(item.id, depth + 1),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }));
  }
  return buildChildren(null, 0);
}

/** 将 getProjectTodosTree 的树形结果压平并加上 WBS 编码（1, 1.1, 1.2...），供表格展示 */
export function flattenProjectTodoTree(nodes: ProjectTodoNode[]): (FirmProject & { wbsCode: string })[] {
  const counter: number[] = [];
  const out: (FirmProject & { wbsCode: string })[] = [];
  function walk(list: ProjectTodoNode[], depth: number) {
    list.forEach((node, idx) => {
      counter[depth] = idx + 1;
      for (let i = depth + 1; i < counter.length; i++) counter[i] = 0;
      const wbsCode = counter.slice(0, depth + 1).join('.');
      out.push({
        id: node.id,
        orderId: node.orderId,
        type: node.type,
        title: node.title,
        description: node.description ?? null,
        status: node.status,
        sortOrder: node.sortOrder,
        wbsCode,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      });
      walk(node.children, depth + 1);
    });
  }
  walk(nodes, 0);
  return out;
}

/** 项目列表项（Firm 工作台） */
export interface FirmProjectSummary {
  projectId: string;
  orderId: string;
  firmSpaceId: string;
  clientSpaceId: string;
  clientName?: string;
  skuId: string;
  skuName?: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  status: string;
  startAt?: string | null;
  endAt?: string | null;
  taskTotal: number;
  taskCompleted: number;
  createdAt?: string;
}

/** Firm 空间：项目列表（按 firm_space_id 直接查 public.projects，带统计） */
export async function getFirmProjects(
  firmSpaceId: string,
  filters?: { status?: string; clientSpaceId?: string }
): Promise<FirmProjectSummary[]> {
  let q = supabase
    .from('projects')
    .select('id, order_id, firm_space_id, client_space_id, name, description, image_url, status, start_at, end_at, created_at')
    .eq('firm_space_id', firmSpaceId);
  if (filters?.clientSpaceId) q = q.eq('client_space_id', filters.clientSpaceId);
  const { data: projects, error: projErr } = await q.order('created_at', { ascending: false });
  if (projErr || !projects?.length) return [];
  const projectIds = (projects as any[]).map((p) => p.id);
  const orders = await getFirmOrders(firmSpaceId, filters?.clientSpaceId);
  const [todosRes, clientsRes] = await Promise.all([
    supabase.from('project_todos').select('project_id, status, item_kind').in('project_id', projectIds),
    supabase.schema('firm').from('clients').select('client_space_id, display_name').eq('firm_space_id', firmSpaceId),
  ]);
  const orderMap = new Map(orders.map((o) => [o.id, o]));
  const skuIds = [...new Set(orders.map((o) => o.skuId))];
  const { data: skuData } = await supabase.schema('firm').from('skus').select('id, name').in('id', skuIds);
  const skuNameById: Record<string, string> = {};
  (skuData || []).forEach((s: any) => { skuNameById[s.id] = s.name ?? ''; });
  const clientNameBySpace: Record<string, string> = {};
  (clientsRes.data || []).forEach((c: any) => { clientNameBySpace[c.client_space_id] = c.display_name ?? ''; });
  const todoCountByProject: Record<string, { total: number; completed: number }> = {};
  (todosRes.data || []).forEach((t: any) => {
    if ((t.item_kind ?? 'task') !== 'task') return;
    if (!todoCountByProject[t.project_id]) todoCountByProject[t.project_id] = { total: 0, completed: 0 };
    todoCountByProject[t.project_id].total += 1;
    if (t.status === 'success') todoCountByProject[t.project_id].completed += 1;
  });
  let list = (projects as any[]).map((p: any) => {
    const order = orderMap.get(p.order_id);
    const counts = todoCountByProject[p.id] ?? { total: 0, completed: 0 };
    return {
      projectId: p.id,
      orderId: p.order_id,
      firmSpaceId: p.firm_space_id ?? '',
      clientSpaceId: p.client_space_id ?? '',
      clientName: clientNameBySpace[p.client_space_id],
      skuId: order?.skuId ?? '',
      skuName: order?.skuId ? skuNameById[order.skuId] : undefined,
      name: p.name ?? '',
      description: p.description ?? null,
      imageUrl: p.image_url ?? null,
      status: p.status ?? 'in_progress',
      startAt: p.start_at ?? null,
      endAt: p.end_at ?? null,
      taskTotal: counts.total,
      taskCompleted: counts.completed,
      createdAt: p.created_at,
    };
  });
  if (filters?.status) list = list.filter((p) => p.status === filters.status);
  list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return list;
}

/** 项目详情（基础信息 + 统计） */
export async function getProjectDetail(orderId: string): Promise<{
  project: FirmProjectInfo | null;
  order: FirmOrderById | null;
  clientName?: string;
  skuName?: string;
  taskTotal: number;
  taskCompleted: number;
} | null> {
  const [order, project, todos] = await Promise.all([
    getOrderById(orderId),
    getProjectByOrderId(orderId),
    getOrderProjects(orderId),
  ]);
  if (!order) return null;
  const taskTodos = todos.filter((t: any) => (t.itemKind ?? t.item_kind ?? 'task') === 'task');
  const taskTotal = taskTodos.length;
  const taskCompleted = taskTodos.filter((t) => t.status === 'success').length;
  let clientName: string | undefined;
  let skuName: string | undefined;
  if (order.clientSpaceId) {
    const { data: c } = await supabase.schema('firm').from('clients').select('display_name').eq('client_space_id', order.clientSpaceId).eq('firm_space_id', order.firmSpaceId).maybeSingle();
    clientName = (c as any)?.display_name;
  }
  const { data: sku } = await supabase.schema('firm').from('skus').select('name').eq('id', order.skuId).maybeSingle();
  skuName = (sku as any)?.name;
  return {
    project: project ?? null,
    order,
    clientName,
    skuName,
    taskTotal,
    taskCompleted,
  };
}

/** 更新项目基础信息 */
export async function updateProject(
  projectId: string,
  payload: { name?: string; description?: string | null; imageUrl?: string | null; status?: string; startAt?: string | null; endAt?: string | null }
): Promise<{ error: Error | null }> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.name !== undefined) updates.name = payload.name;
  if (payload.description !== undefined) updates.description = payload.description;
  if (payload.imageUrl !== undefined) updates.image_url = payload.imageUrl;
  if (payload.status !== undefined) updates.status = payload.status;
  if (payload.startAt !== undefined) updates.start_at = payload.startAt;
  if (payload.endAt !== undefined) updates.end_at = payload.endAt;
  const { error } = await supabase.from('projects').update(updates).eq('id', projectId);
  if (error) {
    console.error('updateProject:', error);
    return { error: error as Error };
  }
  return { error: null };
}

/** 新增项目任务（todo） */
export async function createProjectTodo(params: {
  orderId: string;
  parentId?: string | null;
  type: FirmProject['type'];
  title: string;
  description?: string | null;
  sortOrder?: number;
}): Promise<{ id: string | null; error: Error | null }> {
  const projectId = await getProjectIdByOrderId(params.orderId);
  if (!projectId) return { id: null, error: new Error('Project not found') };
  const q = supabase
    .from('project_todos')
    .select('sort_order')
    .eq('project_id', projectId);
  if (params.parentId != null) q.eq('parent_id', params.parentId);
  else q.is('parent_id', null);
  const maxOrder = await q.order('sort_order', { ascending: false }).limit(1).maybeSingle();
  const nextOrder = (maxOrder.data as any)?.sort_order != null ? (maxOrder.data as any).sort_order + 1 : 1;
  const { data, error } = await supabase
    .from('project_todos')
    .insert({
      project_id: projectId,
      parent_id: params.parentId ?? null,
      type: params.type,
      title: params.title,
      description: params.description ?? null,
      status: 'action_required',
      sort_order: params.sortOrder ?? nextOrder,
    })
    .select('id')
    .single();
  if (error) {
    console.error('createProjectTodo:', error);
    return { id: null, error: error as Error };
  }
  return { id: (data as any)?.id ?? null, error: null };
}

/** 更新项目任务 */
export async function updateProjectTodo(
  todoId: string,
  payload: { title?: string; description?: string | null; status?: FirmProject['status']; sortOrder?: number; parentId?: string | null }
): Promise<{ error: Error | null }> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.title !== undefined) updates.title = payload.title;
  if (payload.description !== undefined) updates.description = payload.description;
  if (payload.status !== undefined) updates.status = payload.status;
  if (payload.sortOrder !== undefined) updates.sort_order = payload.sortOrder;
  if (payload.parentId !== undefined) updates.parent_id = payload.parentId;
  const { error } = await supabase.from('project_todos').update(updates).eq('id', todoId);
  if (error) {
    console.error('updateProjectTodo:', error);
    return { error: error as Error };
  }
  return { error: null };
}

/** 删除项目任务（Phase 1：仅允许叶子节点，即无子节点） */
export async function deleteProjectTodo(todoId: string): Promise<{ error: Error | null }> {
  const { data: children } = await supabase.from('project_todos').select('id').eq('parent_id', todoId).limit(1);
  if (children && (children as any[]).length > 0) {
    return { error: new Error('Only leaf tasks can be deleted') };
  }
  const { error } = await supabase.from('project_todos').delete().eq('id', todoId);
  if (error) {
    console.error('deleteProjectTodo:', error);
    return { error: error as Error };
  }
  return { error: null };
}

/** 任务关联的文件（收据）摘要，用于 Todos 页 task 下文件列表 */
export interface ProjectTodoReceiptSummary {
  id: string;
  name: string;
  imageUrl?: string | null;
}

/** 获取某 project_todo 关联的 receipts 列表（用于 task 展开展示；点击进入 receipt 详情） */
export async function getReceiptsByProjectTodoId(projectTodoId: string): Promise<ProjectTodoReceiptSummary[]> {
  const { data: links, error: linkErr } = await supabase
    .from('project_todo_receipts')
    .select('receipt_id')
    .eq('project_todo_id', projectTodoId);
  if (linkErr || !links?.length) return [];
  const receiptIds = (links as any[]).map((r) => r.receipt_id);
  const { data: rows, error } = await supabase
    .from('receipts')
    .select('id, image_url, total_amount, date')
    .in('id', receiptIds);
  if (error || !rows?.length) return [];
  return (rows as any[]).map((r) => ({
    id: r.id,
    name: r.date
      ? `Receipt ${typeof r.date === 'string' ? r.date.split('T')[0] : r.date}${r.total_amount != null ? ` · ${Number(r.total_amount).toFixed(2)}` : ''}`
      : 'Receipt',
    imageUrl: r.image_url ?? null,
  }));
}

/** 批量获取多个 project_todo 关联的 receipts（key = todoId） */
export async function getReceiptsByProjectTodoIds(
  projectTodoIds: string[]
): Promise<Record<string, ProjectTodoReceiptSummary[]>> {
  if (projectTodoIds.length === 0) return {};
  const { data: links, error: linkErr } = await supabase
    .from('project_todo_receipts')
    .select('project_todo_id, receipt_id')
    .in('project_todo_id', projectTodoIds);
  if (linkErr || !links?.length) return {};
  const receiptIds = [...new Set((links as any[]).map((r) => r.receipt_id))];
  const todoIdByReceiptId = new Map<string, string[]>();
  (links as any[]).forEach((r) => {
    const list = todoIdByReceiptId.get(r.receipt_id) ?? [];
    list.push(r.project_todo_id);
    todoIdByReceiptId.set(r.receipt_id, list);
  });
  const { data: rows, error } = await supabase
    .from('receipts')
    .select('id, image_url, total_amount, date')
    .in('id', receiptIds);
  if (error || !rows?.length) return {};
  const summary = (r: any) => ({
    id: r.id,
    name: r.date
      ? `Receipt ${typeof r.date === 'string' ? r.date.split('T')[0] : r.date}${r.total_amount != null ? ` · ${Number(r.total_amount).toFixed(2)}` : ''}`
      : 'Receipt',
    imageUrl: r.image_url ?? null,
  });
  const out: Record<string, ProjectTodoReceiptSummary[]> = {};
  projectTodoIds.forEach((id) => { out[id] = []; });
  (rows as any[]).forEach((r) => {
    const todoIds = todoIdByReceiptId.get(r.id) ?? [];
    const s = summary(r);
    todoIds.forEach((tid) => {
      if (!out[tid]) out[tid] = [];
      out[tid].push(s);
    });
  });
  return out;
}

/** 将收据关联到 project_todo（上传文件到任务后调用） */
export async function linkReceiptToProjectTodo(
  projectTodoId: string,
  receiptId: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('project_todo_receipts')
    .insert({ project_todo_id: projectTodoId, receipt_id: receiptId });
  return { error: error ? new Error(error.message) : null };
}

/** Firm 空间：获取某客户或全部客户的「待办」列表（订单项扁平，兼容原 todo 页） */
export async function getFirmClientTodos(
  firmSpaceId: string,
  clientSpaceId?: string
): Promise<FirmClientTodo[]> {
  const orders = await getFirmOrders(firmSpaceId, clientSpaceId);
  if (orders.length === 0) return [];

  const orderIds = orders.map((o) => o.id);
  const { data: projectsData } = await supabase.from('projects').select('id, order_id').in('order_id', orderIds);
  const projectIds = (projectsData || []).map((p: any) => p.id);
  const orderIdByProjectId: Record<string, string> = {};
  (projectsData || []).forEach((p: any) => { orderIdByProjectId[p.id] = p.order_id; });
  if (projectIds.length === 0) return [];
  const { data: itemsData, error: itemsErr } = await supabase
    .from('project_todos')
    .select('*')
    .in('project_id', projectIds)
    .order('sort_order', { ascending: true });

  if (itemsErr) {
    console.error('getFirmClientTodos projects:', itemsErr);
    return [];
  }

  const orderMap: Record<string, FirmOrder> = {};
  orders.forEach((o) => { orderMap[o.id] = o; });

  const items = (itemsData || []).map((row: any) => {
    const orderId = orderIdByProjectId[row.project_id];
    const order = orderMap[orderId];
    return {
      id: row.id,
      orderId: orderId ?? row.project_id,
      firmSpaceId: order?.firmSpaceId ?? '',
      clientSpaceId: order?.clientSpaceId ?? '',
      title: row.title,
      description: row.description ?? null,
      dueAt: order?.dueAt ?? null,
      status: row.status,
      sortOrder: row.sort_order ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });

  items.sort((a, b) => {
    const da = a.dueAt || '';
    const db = b.dueAt || '';
    if (da !== db) return da.localeCompare(db);
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });
  return items;
}

/** Firm 空间：获取服务 SKU 列表 */
export async function getFirmSkus(firmSpaceId: string): Promise<FirmSku[]> {
  const { data, error } = await supabase
    .schema('firm')
    .from('skus')
    .select('*')
    .eq('firm_space_id', firmSpaceId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getFirmSkus:', error);
    return [];
  }
  const rows = data || [];

  // 统计每个 SKU 关联的 sku_items 数量（用于在 UI 中展示 items 数）
  let itemsCountMap: Record<string, number> = {};
  const skuIds = rows.map((r: any) => r.id).filter(Boolean);
  if (skuIds.length > 0) {
    const { data: items, error: itemsErr } = await supabase
      .schema('firm')
      .from('sku_items')
      .select('sku_id')
      .in('sku_id', skuIds);

    if (itemsErr) {
      console.error('getFirmSkus sku_items:', itemsErr);
    } else {
      itemsCountMap = {};
      (items || []).forEach((row: any) => {
        const id = row.sku_id;
        if (!id) return;
        itemsCountMap[id] = (itemsCountMap[id] ?? 0) + 1;
      });
    }
  }

  return rows.map((row: any) => ({
    id: row.id,
    firmSpaceId: row.firm_space_id,
    name: row.name,
    description: row.description ?? undefined,
    imageUrl: row.image_url ?? null,
    isPublished: row.is_published ?? false,
    itemsCount: itemsCountMap[row.id] ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/** Firm 空间：更新 SKU（名称、介绍、封面图） */
export async function updateFirmSku(
  skuId: string,
  payload: { name?: string; description?: string | null; imageUrl?: string | null; isPublished?: boolean }
): Promise<{ error: Error | null }> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.name !== undefined) updates.name = payload.name;
  if (payload.description !== undefined) updates.description = payload.description;
  if (payload.imageUrl !== undefined) updates.image_url = payload.imageUrl;
  if (payload.isPublished !== undefined) updates.is_published = payload.isPublished;
  const { error } = await supabase
    .schema('firm')
    .from('skus')
    .update(updates)
    .eq('id', skuId);
  if (error) {
    console.error('updateFirmSku:', error);
    return { error: error as Error };
  }
  return { error: null };
}

/** 将预设 SKU（preset_skus + preset_sku_items）复制到指定 firm 空间；仅该空间成员可调用。locale 可选：'zh' | 'en'，默认 'zh' */
export async function applyPresetSkusToFirm(
  firmSpaceId: string,
  locale: 'zh' | 'en' = 'zh'
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc('apply_preset_skus_to_firm', {
    p_firm_space_id: firmSpaceId,
    p_locale: locale,
  });
  if (error) {
    console.error('applyPresetSkusToFirm:', error);
    return { error: error as Error };
  }
  return { error: null };
}

/** Firm 空间：获取 SKU 关联的 sku_items（按树深度优先排序；sort_order 为同 parent 兄弟序） */
export async function getSkuItems(skuId: string): Promise<FirmSkuItem[]> {
  const { data, error } = await supabase
    .schema('firm')
    .from('sku_items')
    .select('*')
    .eq('sku_id', skuId);

  if (error) {
    console.error('getSkuItems:', error);
    return [];
  }
  const mapped = (data || []).map((row: any) => ({
    id: row.id,
    skuId: row.sku_id,
    parentId: row.parent_id ?? null,
    itemKind: (row.item_kind ?? 'task') as 'phase' | 'section' | 'task',
    type: row.type,
    title: row.title,
    description: row.description ?? null,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  return sortSkuItemsDepthFirst(mapped);
}

/** Firm 空间：获取「模板」列表（兼容：即 SKU 列表，带 items 来自 sku_items） */
export async function getFirmTemplates(firmSpaceId: string): Promise<FirmTemplate[]> {
  const skus = await getFirmSkus(firmSpaceId);
  if (skus.length === 0) return [];

  const skuIds = skus.map((s) => s.id);
  const { data: itemsData } = await supabase
    .schema('firm')
    .from('sku_items')
    .select('id, sku_id, parent_id, sort_order, title, description')
    .in('sku_id', skuIds);

  const itemsBySku: Record<string, Array<{ title: string; description?: string }>> = {};
  for (const skuId of skuIds) {
    const rows = (itemsData || []).filter((r: any) => r.sku_id === skuId);
    const ordered = sortSkuItemsDepthFirst(
      rows.map((row: any) => ({
        id: row.id,
        parentId: row.parent_id ?? null,
        sortOrder: row.sort_order ?? 0,
        title: row.title,
        description: row.description,
      }))
    );
    itemsBySku[skuId] = ordered.map((r: any) => ({
      title: r.title ?? '',
      description: r.description ?? undefined,
    }));
  }

  return skus.map((s) => ({
    ...s,
    items: itemsBySku[s.id] ?? [],
  }));
}

/** Firm 空间：获取客户跟进记录（可选指定某客户） */
export async function getFirmClientFollowUps(
  firmSpaceId: string,
  clientSpaceId?: string
): Promise<FirmClientFollowUp[]> {
  let q = supabase
    .schema('firm')
    .from('client_follow_ups')
    .select('*')
    .eq('firm_space_id', firmSpaceId);
  if (clientSpaceId) q = q.eq('client_space_id', clientSpaceId);
  const { data, error } = await q.order('created_at', { ascending: false });

  if (error) {
    console.error('getFirmClientFollowUps:', error);
    return [];
  }
  return (data || []).map((row: any) => ({
    id: row.id,
    firmSpaceId: row.firm_space_id,
    clientSpaceId: row.client_space_id,
    content: row.content ?? '',
    createdAt: row.created_at,
    createdBy: row.created_by ?? null,
  }));
}

/** Firm 空间：新增客户跟进记录（插入后 trigger 会更新 clients.last_follow_up_at） */
export async function addFirmClientFollowUp(
  firmSpaceId: string,
  clientSpaceId: string,
  content: string
): Promise<{ id: string | null; error: Error | null }> {
  const { data: user } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .schema('firm')
    .from('client_follow_ups')
    .insert({
      firm_space_id: firmSpaceId,
      client_space_id: clientSpaceId,
      content: (content || '').trim(),
      created_by: user.user?.id ?? null,
    })
    .select('id')
    .single();

  if (error) return { id: null, error: error as Error };
  return { id: (data as any)?.id ?? null, error: null };
}

/** 更新客户状态 */
export async function updateFirmClientStatus(
  clientId: string,
  status: FirmClientStatus
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .schema('firm')
    .from('clients')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', clientId);
  return { error: error ? new Error(error.message) : null };
}

/** 更新客户负责人 */
export async function updateFirmClientAssignee(
  clientId: string,
  assignedUserId: string | null
): Promise<{ error: Error | null }> {
  // 先查出 client 对应的 firm_space_id / client_space_id
  const { data: clientRow, error: clientErr } = await supabase
    .schema('firm')
    .from('clients')
    .select('firm_space_id, client_space_id')
    .eq('id', clientId)
    .maybeSingle();

  if (clientErr || !clientRow) {
    return { error: clientErr ? new Error(clientErr.message) : new Error('Client not found') };
  }

  const firmSpaceId: string = (clientRow as any).firm_space_id;
  const clientSpaceId: string = (clientRow as any).client_space_id;

  // 清空该 client 当前的所有 assignee
  const { error: delErr } = await supabase
    .schema('firm')
    .from('member_clients')
    .delete()
    .eq('firm_space_id', firmSpaceId)
    .eq('client_space_id', clientSpaceId);

  if (delErr) {
    return { error: new Error(delErr.message) };
  }

  // 若指定了新的负责人，则插入一条 member_clients 记录
  if (assignedUserId) {
    const { error: insErr } = await supabase
      .schema('firm')
      .from('member_clients')
      .insert({
        firm_space_id: firmSpaceId,
        user_id: assignedUserId,
        client_space_id: clientSpaceId,
        created_at: new Date().toISOString(),
      });

    if (insErr) {
      return { error: new Error(insErr.message) };
    }
  }

  return { error: null };
}

/** 批量删除客户（firm.clients） */
export async function deleteFirmClients(clientIds: string[]): Promise<{ error: Error | null }> {
  if (clientIds.length === 0) return { error: null };
  const { error } = await supabase
    .schema('firm')
    .from('clients')
    .delete()
    .in('id', clientIds);
  return { error: error ? new Error(error.message) : null };
}

/** 更新某条 project_todo 的状态（id 为 todo id） */
export async function updateProjectStatus(
  projectId: string,
  status: FirmProject['status']
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('project_todos')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', projectId);
  return { error: error ? new Error(error.message) : null };
}

/** 更新订单状态（整单提交/确认） */
export async function updateOrderStatus(
  orderId: string,
  status: FirmOrderStatus
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .schema('firm')
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orderId);
  return { error: error ? new Error(error.message) : null };
}

/** 兼容：按 project_todo id 更新状态（原 updateClientTodoStatus） */
export async function updateClientTodoStatus(
  id: string,
  status: ProjectTodoStatus
): Promise<{ error: Error | null }> {
  return updateProjectStatus(id, status);
}
