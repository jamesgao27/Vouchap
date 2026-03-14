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
  FirmProjectType,
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
    .eq('responsible_side', 'client')
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
  /** 客户接受订单后创建的 project id，用于 client 侧以 project 为主体的路由 */
  projectId?: string;
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
  /** SKU 名称（附带查询，用于项目信息展示） */
  skuName?: string | null;
  /** SKU 描述（附带查询，用于项目信息展示） */
  skuDescription?: string | null;
}

/** 根据 orderId 获取订单（用于 engagement 详情）；附带查询关联 SKU 基本信息 */
export async function getOrderById(orderId: string): Promise<FirmOrderById | null> {
  const { data, error } = await supabase
    .schema('firm')
    .from('orders')
    .select('id, firm_space_id, client_space_id, sku_id, status, due_at, created_at, updated_at')
    .eq('id', orderId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as any;

  // 附带拉取 SKU 名称与描述，供详情页展示
  let skuName: string | null = null;
  let skuDescription: string | null = null;
  if (row.sku_id) {
    const { data: skuRow } = await supabase
      .schema('firm')
      .from('skus')
      .select('name, description')
      .eq('id', row.sku_id)
      .maybeSingle();
    if (skuRow) {
      skuName = (skuRow as any).name ?? null;
      skuDescription = (skuRow as any).description ?? null;
    }
  }

  return {
    id: row.id,
    firmSpaceId: row.firm_space_id,
    clientSpaceId: row.client_space_id,
    skuId: row.sku_id,
    status: row.status ?? 'onboarding',
    dueAt: row.due_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    skuName,
    skuDescription,
  };
}

/** 根据 client_space_id + firm_space_id 查客户展示名（用于订单详情顶栏 "Service for [client]"）；无 clients 记录时用 space 名称兜底 */
export async function getClientDisplayName(
  clientSpaceId: string,
  firmSpaceId: string
): Promise<string | null> {
  const { data } = await supabase
    .schema('firm')
    .from('clients')
    .select('created_client_name')
    .eq('client_space_id', clientSpaceId)
    .eq('firm_space_id', firmSpaceId)
    .maybeSingle();
  const fromClients = (data as any)?.created_client_name ?? null;
  if (fromClients) return fromClients;
  const { data: spaceRow } = await supabase
    .from('spaces')
    .select('name')
    .eq('id', clientSpaceId)
    .maybeSingle();
  return (spaceRow as any)?.name ?? null;
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

/** 根据 skuId 获取 SKU 基本信息（名称、说明、封面、报税辖区与场景、发布状态、模板状态） */
export async function getSkuById(skuId: string): Promise<{ name: string; description?: string | null; imageUrl?: string | null; taxCountry?: string | null; taxScenario?: string | null; isPublished?: boolean; templateStatus?: 'draft' | 'private' | 'published' | null } | null> {
  const { data, error } = await supabase
    .schema('firm')
    .from('skus')
    .select('name, description, image_url, tax_country, tax_scenario, is_published, template_status')
    .eq('id', skuId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as any;
  const templateStatus = row.template_status === 'draft' || row.template_status === 'private' || row.template_status === 'published' ? row.template_status : null;
  return {
    name: row.name ?? '',
    description: row.description ?? null,
    imageUrl: row.image_url ?? null,
    taxCountry: row.tax_country ?? null,
    taxScenario: row.tax_scenario ?? null,
    isPublished: row.is_published ?? false,
    templateStatus: templateStatus ?? undefined,
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
      const canceled = t.status === 'canceled' || t.status === 'cancelled';
      if (canceled) return;
      if (!todoCountByProjectId[t.project_id]) todoCountByProjectId[t.project_id] = { total: 0, completed: 0 };
      todoCountByProjectId[t.project_id].total += 1;
      if (t.status === 'success' || t.status === 'completed') todoCountByProjectId[t.project_id].completed += 1;
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
      projectId: project?.id ?? undefined,
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
    createdClientName: row.created_client_name ?? null,
    createdContactName: row.created_contact_name ?? null,
    createdContactEmail: row.created_contact_email ?? null,
    status: row.status ?? 'active',
    labels: Array.isArray(row.labels) ? row.labels : [],
    assignedUserId: null,
    lastFollowUpAt: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/** 列表项：关联的 client，含名称、联系人、服务负责人、自动计算状态、最近跟进时间等 */
export interface FirmClientWithDetails extends FirmClient {
  /** 名称：created_client_name 或 client 空间名称 */
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
  /** 是否为待认领（仅 invitee，尚无 client space） */
  isPendingClaim?: boolean;
  /** 对应 firm.invitee_clients.id，仅 isPendingClaim 时有值 */
  inviteeClientId?: string | null;
}

/** Firm 空间：获取在服客户列表（含名称、联系人、服务负责人、自动计算 displayStatus、最近跟进时间）；含待认领 invitee（无 client space 的订单联系人） */
export async function getFirmClientsWithDetails(firmSpaceId: string): Promise<FirmClientWithDetails[]> {
  const [clients, ordersAll, inviteeList] = await Promise.all([
    getFirmClients(firmSpaceId),
    supabase.schema('firm').from('orders').select('client_space_id, invitee_client_id').eq('firm_space_id', firmSpaceId),
    supabase.schema('firm').from('invitee_clients').select('id, invitee_client_name, invitee_contact_name, invitee_contact_email, created_at').eq('firm_space_id', firmSpaceId),
  ]);
  const ordersData = ordersAll.data || [];
  const pendingInviteeIds = new Set<string>();
  ordersData.forEach((o: any) => {
    if (o.client_space_id == null && o.invitee_client_id) pendingInviteeIds.add(o.invitee_client_id);
  });
  const pendingInvitees = (inviteeList.data || []).filter((inv: any) => pendingInviteeIds.has(inv.id));

  if (clients.length === 0 && pendingInvitees.length === 0) return [];

  const spaceIds = [...new Set(clients.map((c) => c.clientSpaceId))];
  const ctx = getTaxSeasonContext();

  const [spacesRes, userSpacesRes, ordersRes, memberClientsRes, followUpsRes] = await Promise.all([
    spaceIds.length > 0 ? supabase.from('spaces').select('id, name').in('id', spaceIds) : Promise.resolve({ data: [] as any[] }),
    spaceIds.length > 0 ? supabase.from('user_spaces').select('space_id, user_id, is_admin').in('space_id', spaceIds) : Promise.resolve({ data: [] as any[] }),
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

  // 联系人：每个 client 空间优先取 is_admin=true 的用户，若无则取该空间任一成员，确保有订单的 client 能显示联系人/邮箱
  const bySpace: Record<string, { user_id: string; is_admin: boolean }[]> = {};
  (userSpacesRes.data || []).forEach((us: any) => {
    if (!bySpace[us.space_id]) bySpace[us.space_id] = [];
    bySpace[us.space_id].push({ user_id: us.user_id, is_admin: us.is_admin === true });
  });
  const spaceToUserId: Record<string, string> = {};
  Object.keys(bySpace).forEach((sid) => {
    const list = bySpace[sid];
    const admin = list.find((x) => x.is_admin);
    const pick = admin || list[0];
    if (pick) spaceToUserId[sid] = pick.user_id;
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

  const detailedClients = clients.map((c) => {
    const space = spaceMap[c.clientSpaceId];
    const contactUserId = spaceToUserId[c.clientSpaceId];
    const contactUser = contactUserId ? userMap[contactUserId] : null;
    const assigneeIds = clientSpaceToUserIds[c.clientSpaceId] || [];
    const assigneeNames = assigneeIds.map((id) => userMap[id]?.name).filter(Boolean) as string[];
    const assigneeName = assigneeNames.length > 0 ? assigneeNames.join('、') : null;
    const assigneeEmailVal = assigneeIds[0] ? (userMap[assigneeIds[0]]?.email ?? null) : null;
    const displayStatus = computeClientDisplayStatus(c.clientSpaceId, orders, ctx);
    const hasConfirmed = contactUserId != null;
    const name = c.createdClientName?.trim() || space?.name || contactUser?.name || c.createdContactName?.trim() || c.clientSpaceId;
    const contactName = hasConfirmed ? (contactUser?.name ?? null) : (c.createdContactName ?? null);
    const contactEmail = hasConfirmed ? (contactUser?.email ?? null) : (c.createdContactEmail ?? null);
    return {
      ...c,
      assignedUserId: assigneeIds[0] ?? null,
      lastFollowUpAt: clientSpaceToLastFollowUp[c.clientSpaceId] ?? null,
      name,
      contactName,
      contactEmail,
      serviceStartAt: c.createdAt ?? null,
      displayStatus,
      assigneeName,
      assigneeEmail: assigneeEmailVal,
      isPendingClaim: false,
      inviteeClientId: null,
    };
  });

  const pendingRows: FirmClientWithDetails[] = pendingInvitees.map((inv: any) => {
    const name = inv.invitee_client_name || inv.invitee_contact_name || inv.invitee_contact_email || 'Pending';
    return {
      id: inv.id,
      firmSpaceId,
      clientSpaceId: '',
      createdClientName: inv.invitee_client_name ?? null,
      createdContactName: inv.invitee_contact_name ?? null,
      createdContactEmail: inv.invitee_contact_email ?? null,
      status: 'active',
      labels: [],
      assignedUserId: null,
      lastFollowUpAt: null,
      createdAt: inv.created_at,
      updatedAt: inv.created_at,
      name,
      contactName: inv.invitee_contact_name ?? null,
      contactEmail: inv.invitee_contact_email ?? null,
      serviceStartAt: null,
      displayStatus: 'new' as ClientDisplayStatus,
      assigneeName: null,
      assigneeEmail: null,
      isPendingClaim: true,
      inviteeClientId: inv.id,
    };
  });

  return [...detailedClients, ...pendingRows];
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
    inviteeClientId: row.invitee_client_id ?? null,
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
  /** 报税分类：项目维度上的国家 / 场景 / 自定义标签（来自 projects.tax_country / tax_scenario / tags） */
  taxCountry?: string | null;
  taxScenario?: string | null;
  tags?: string[] | null;
  taxSeasonYear?: number | null;
}

/** Firm 空间：获取订单列表（含客户名、SKU 名、来源、负责人），用于表格展示；含 pending（client_space_id 为空）订单，客户名取自 invitee_clients */
export async function getFirmOrdersWithDetails(
  firmSpaceId: string,
  clientSpaceId?: string
): Promise<FirmOrderWithDetails[]> {
  const orders = await getFirmOrders(firmSpaceId, clientSpaceId);
  if (orders.length === 0) return [];

  const clientSpaceIds = [...new Set(orders.map((o) => o.clientSpaceId).filter(Boolean))] as string[];
  const inviteeClientIds = [...new Set(orders.map((o) => o.inviteeClientId).filter(Boolean))] as string[];
  const skuIds = [...new Set(orders.map((o) => o.skuId))];
  const createdByIds = [...new Set(orders.map((o) => o.createdBy).filter(Boolean))] as string[];
  const orderIds = [...new Set(orders.map((o) => o.id))];

  const [spacesRes, skusRes, usersRes, projectsRes, inviteeRes] = await Promise.all([
    clientSpaceIds.length > 0 ? supabase.from('spaces').select('id, name').in('id', clientSpaceIds) : Promise.resolve({ data: [] as any[] }),
    supabase.schema('firm').from('skus').select('id, name').in('id', skuIds),
    createdByIds.length > 0
      ? supabase.from('users').select('id, name, email').in('id', createdByIds)
      : Promise.resolve({ data: [] as any[] }),
    supabase
      .from('projects')
      .select('order_id, tax_country, tax_scenario, tags')
      .in('order_id', orderIds),
    inviteeClientIds.length > 0
      ? supabase.schema('firm').from('invitee_clients').select('id, invitee_client_name, invitee_contact_name, invitee_contact_email').in('id', inviteeClientIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const spaceMap: Record<string, string> = {};
  (spacesRes.data || []).forEach((s: any) => {
    spaceMap[s.id] = s.name || s.id;
  });
  const inviteeMap: Record<string, { name: string; email: string }> = {};
  (inviteeRes.data || []).forEach((inv: any) => {
    const name = inv.invitee_client_name || inv.invitee_contact_name || inv.invitee_contact_email || 'Pending';
    inviteeMap[inv.id] = { name, email: inv.invitee_contact_email || '' };
  });
  const skuMap: Record<string, string> = {};
  (skusRes.data || []).forEach((s: any) => {
    skuMap[s.id] = s.name || s.id;
  });
  const userMap: Record<string, { name: string | null; email: string }> = {};
  (usersRes.data || []).forEach((u: any) => {
    userMap[u.id] = { name: u.name ?? null, email: u.email || '' };
  });

  const projectMap: Record<
    string,
    { taxCountry: string | null; taxScenario: string | null; tags: string[] | null; taxSeasonYear: number | null }
  > = {};
  (projectsRes.data || []).forEach((p: any) => {
    const orderId = p.order_id as string | undefined;
    if (!orderId) return;
    projectMap[orderId] = {
      taxCountry: p.tax_country ?? null,
      taxScenario: p.tax_scenario ?? null,
      tags: Array.isArray(p.tags) ? (p.tags as string[]) : null,
      taxSeasonYear: typeof p.tax_season_year === 'number' ? p.tax_season_year : null,
    };
  });

  return orders.map((o) => {
    const creator = o.createdBy ? userMap[o.createdBy] : null;
    const assigneeName = creator ? (creator.name || creator.email || null) : null;
    const project = projectMap[o.id];
    const clientName = o.clientSpaceId
      ? (spaceMap[o.clientSpaceId] ?? o.clientSpaceId)
      : (o.inviteeClientId && inviteeMap[o.inviteeClientId]
          ? inviteeMap[o.inviteeClientId].name + (inviteeMap[o.inviteeClientId].email ? ` (${inviteeMap[o.inviteeClientId].email})` : '')
          : 'Pending claim');
    return {
      ...o,
      clientName,
      skuName: skuMap[o.skuId] ?? o.skuId,
      source: 'Manual',
      assigneeName,
      taxCountry: project?.taxCountry ?? null,
      taxScenario: project?.taxScenario ?? null,
      tags: project?.tags ?? null,
      taxSeasonYear: project?.taxSeasonYear ?? null,
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
    .select('id, name, description, image_url, tax_country, tax_scenario')
    .eq('id', order.sku_id)
    .single();

  if (skuErr || !sku) {
    return { error: skuErr ? new Error(skuErr.message) : new Error('SKU not found') };
  }

  const { data: projectRow, error: projectErr } = await supabase
    .from('projects')
    .insert({
      firm_space_id: (order as any).firm_space_id,
      // 对于 pending orders，client_space_id 可为空；迁移后会补上真实 client_space_id
      client_space_id: (order as any).client_space_id ?? null,
      order_id: order.id,
      name: (sku as any).name ?? 'Project',
      description: (sku as any).description ?? null,
      image_url: (sku as any).image_url ?? null,
      tax_country: (sku as any).tax_country ?? null,
      tax_scenario: (sku as any).tax_scenario ?? null,
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
        type: row.initial_responsible_side,
        title: row.title,
        description: row.description ?? null,
        depends_on_id: row.depends_on_id ?? null,
      }))
    );

    // 第一步：按深度优先顺序全量插入节点（不含 depends_on_id，避免前置节点尚未插入）
    const oldIdToNewId = new Map<string, string>();
    for (let i = 0; i < ordered.length; i++) {
      const row = ordered[i];
      const parent_id = row.parentId ? oldIdToNewId.get(row.parentId) ?? null : null;
      const isTask = (row.item_kind ?? 'task') === 'task';
      // initial_responsible_side=firm → in_progress，client → to_submit；非 task 保持 completed
      const status: ProjectTodoStatus = isTask
        ? (row.type === 'firm' ? 'in_progress' : 'to_submit')
        : 'completed';
      const itemKind = (row.item_kind ?? 'task') as 'phase' | 'section' | 'task';
      const { data: inserted, error: insertErr } = await supabase
        .from('project_todos')
        .insert({
          project_id: projectId,
          parent_id: parent_id,
          responsible_side: row.type,
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

    // 第二步：回填 depends_on_id（全部节点插入后，oldIdToNewId 已完整）
    for (const row of ordered) {
      if (!row.depends_on_id) continue;
      const newTodoId = oldIdToNewId.get(row.id);
      const newDepsId = oldIdToNewId.get(row.depends_on_id);
      if (!newTodoId || !newDepsId) continue;
      await supabase
        .from('project_todos')
        .update({ depends_on_id: newDepsId })
        .eq('id', newTodoId);
    }
  }

  const { error: updateErr } = await updateOrderStatus(orderId, 'collecting');
  return { error: updateErr };
}

/** 项目信息（与 SKU 结构一致，用于详情展示；含报税辖区与场景） */
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
  taxCountry?: string | null;
  taxScenario?: string | null;
  tags?: string[] | null;
  taxSeasonYear?: number | null;
}

/** 根据 orderId 获取 project 信息（确认订单后才有） */
export async function getProjectByOrderId(orderId: string): Promise<FirmProjectInfo | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, order_id, name, description, image_url, status, start_at, end_at, created_at, updated_at, tax_country, tax_scenario, tax_season_year')
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
    taxCountry: row.tax_country ?? null,
    taxScenario: row.tax_scenario ?? null,
    taxSeasonYear: row.tax_season_year ?? null,
  };
}

/** Firm 订单：仅更新 updated_at，用于「Updated」列跟踪项目内任何变更 */
async function touchFirmOrderUpdatedAt(orderId: string | null | undefined): Promise<void> {
  if (!orderId) return;
  try {
    await supabase
      .schema('firm')
      .from('orders')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', orderId);
  } catch (e) {
    console.error('touchFirmOrderUpdatedAt:', e);
  }
}

async function touchFirmOrderUpdatedAtByProjectId(projectId: string | null | undefined): Promise<void> {
  if (!projectId) return;
  const { data, error } = await supabase
    .from('projects')
    .select('order_id')
    .eq('id', projectId)
    .maybeSingle();
  if (error || !data) return;
  const orderId = (data as any).order_id as string | undefined;
  await touchFirmOrderUpdatedAt(orderId);
}

async function touchFirmOrderUpdatedAtByTodoId(todoId: string | null | undefined): Promise<void> {
  if (!todoId) return;
  const { data, error } = await supabase
    .from('project_todos')
    .select('project_id')
    .eq('id', todoId)
    .maybeSingle();
  if (error || !data) return;
  const projectId = (data as any).project_id as string | undefined;
  await touchFirmOrderUpdatedAtByProjectId(projectId);
}

async function touchFirmOrderUpdatedAtByAttachmentId(attachmentId: string | null | undefined): Promise<void> {
  if (!attachmentId) return;
  const { data, error } = await supabase
    .from('project_todo_attachments')
    .select('project_todo_id')
    .eq('id', attachmentId)
    .maybeSingle();
  if (error || !data) return;
  const todoId = (data as any).project_todo_id as string | undefined;
  await touchFirmOrderUpdatedAtByTodoId(todoId);
}

/** 根据 projectId 获取 project 信息（client 侧以 project 为主体的路由用） */
export async function getProjectById(projectId: string): Promise<FirmProjectInfo | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, order_id, name, description, image_url, status, start_at, end_at, created_at, updated_at, tax_country, tax_scenario, tags, tax_season_year')
    .eq('id', projectId)
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
    taxCountry: row.tax_country ?? null,
    taxScenario: row.tax_scenario ?? null,
    tags: (row.tags as string[] | null) ?? [],
    taxSeasonYear: row.tax_season_year ?? null,
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
  return (data || []).map((row: any) => {
    const ids = Array.isArray(row.depends_on_ids) && row.depends_on_ids.length > 0
      ? row.depends_on_ids.filter((x: unknown) => x != null)
      : (row.depends_on_id != null ? [row.depends_on_id] : []);
    return {
      id: row.id,
      orderId: orderId,
      type: row.responsible_side,
      initialResponsibleSide: row.initial_responsible_side ?? row.responsible_side,
      title: row.title,
      description: row.description ?? null,
      status: row.status,
      sortOrder: row.sort_order ?? 0,
      parentId: row.parent_id ?? null,
      itemKind: row.item_kind ?? 'task',
      dependsOnId: ids[0] ?? null,
      dependsOnIds: ids,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

/** 项目任务树节点（WBS）；排序与 SKU-items 一致：同级按 sort_order */
export interface ProjectTodoNode {
  id: string;
  orderId: string;
  parentId: string | null;
  type: FirmProject['type'];
  /** 初始责任方（client/firm）；用于控制 RETURN 等动作是否可见 */
  initialResponsibleSide: FirmProjectType;
  title: string;
  description?: string | null;
  status: FirmProject['status'];
  sortOrder: number;
  depth: number;
  /** phase / section / task；仅 task 可关联文件 */
  itemKind: 'phase' | 'section' | 'task';
  /**
   * 可选前置节点 id（同 order 内的另一个 project_todo）。dependsOnIds 为首项兼容。
   * 非空时，该节点在 UI 层被视为"待解锁"直到所有前置节点 effectiveStatus 为 completed/canceled。
   */
  dependsOnId?: string | null;
  /** 多前置依赖（与 dependsOnId 并存，dependsOnId = dependsOnIds[0]） */
  dependsOnIds?: string[];
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
      initialResponsibleSide: (item as any).initialResponsibleSide ?? item.type,
      title: item.title,
      description: item.description ?? null,
      status: item.status,
      sortOrder: item.sortOrder,
      depth,
      itemKind: (item as any).itemKind ?? 'task',
      dependsOnId: (item as any).dependsOnId ?? null,
      dependsOnIds: (item as any).dependsOnIds ?? ((item as any).dependsOnId != null ? [(item as any).dependsOnId] : []),
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
    supabase.schema('firm').from('clients').select('client_space_id, created_client_name').eq('firm_space_id', firmSpaceId),
  ]);
  const orderMap = new Map(orders.map((o) => [o.id, o]));
  const skuIds = [...new Set(orders.map((o) => o.skuId))];
  const { data: skuData } = await supabase.schema('firm').from('skus').select('id, name').in('id', skuIds);
  const skuNameById: Record<string, string> = {};
  (skuData || []).forEach((s: any) => { skuNameById[s.id] = s.name ?? ''; });
  const clientNameBySpace: Record<string, string> = {};
  (clientsRes.data || []).forEach((c: any) => { clientNameBySpace[c.client_space_id] = c.created_client_name ?? ''; });
  const todoCountByProject: Record<string, { total: number; completed: number }> = {};
  (todosRes.data || []).forEach((t: any) => {
    if ((t.item_kind ?? 'task') !== 'task') return;
    if (t.status === 'canceled' || t.status === 'cancelled') return;
    if (!todoCountByProject[t.project_id]) todoCountByProject[t.project_id] = { total: 0, completed: 0 };
    todoCountByProject[t.project_id].total += 1;
    if (t.status === 'success' || t.status === 'completed') todoCountByProject[t.project_id].completed += 1;
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
  const nonCanceled = taskTodos.filter((t: any) => t.status !== 'canceled' && t.status !== 'cancelled');
  const taskTotal = nonCanceled.length;
  const taskCompleted = nonCanceled.filter((t: any) => t.status === 'success' || t.status === 'completed').length;
  let clientName: string | undefined;
  let skuName: string | undefined;
  if (order.clientSpaceId && order.firmSpaceId) {
    clientName = (await getClientDisplayName(order.clientSpaceId, order.firmSpaceId)) ?? undefined;
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

/** 更新项目基础信息（含报税国别/场景，与 SKU 对齐） */
export async function updateProject(
  projectId: string,
  payload: {
    name?: string;
    description?: string | null;
    imageUrl?: string | null;
    status?: string;
    startAt?: string | null;
    endAt?: string | null;
    taxCountry?: string | null;
    taxScenario?: string | null;
    tags?: string[] | null;
    taxSeasonYear?: number | null;
  }
): Promise<{ error: Error | null }> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.name !== undefined) updates.name = payload.name;
  if (payload.description !== undefined) updates.description = payload.description;
  if (payload.imageUrl !== undefined) updates.image_url = payload.imageUrl;
  if (payload.status !== undefined) updates.status = payload.status;
  if (payload.startAt !== undefined) updates.start_at = payload.startAt;
  if (payload.endAt !== undefined) updates.end_at = payload.endAt;
  if (payload.taxCountry !== undefined) updates.tax_country = payload.taxCountry;
  if (payload.taxScenario !== undefined) updates.tax_scenario = payload.taxScenario;
  if (payload.tags !== undefined) updates.tags = payload.tags;
  if (payload.taxSeasonYear !== undefined) updates.tax_season_year = payload.taxSeasonYear;
  const { error } = await supabase.from('projects').update(updates).eq('id', projectId);
  if (error) {
    console.error('updateProject:', error);
    return { error: error as Error };
  }
  await touchFirmOrderUpdatedAtByProjectId(projectId);
  return { error: null };
}

/**
 * 加载某客户空间下所有项目已使用过的标签，去重后返回，用于编辑时的标签建议。
 */
export async function getSpaceProjectTags(clientSpaceId: string): Promise<string[]> {
  // 1. 取该客户空间下所有 order id
  const { data: orders } = await supabase
    .from('orders')
    .select('id')
    .eq('client_space_id', clientSpaceId);
  const orderIds = (orders as any[] | null)?.map((o) => o.id) ?? [];
  if (orderIds.length === 0) return [];

  // 2. 取所有 project 的 tags 字段
  const { data: projects } = await supabase
    .from('projects')
    .select('tags')
    .in('order_id', orderIds)
    .not('tags', 'is', null);

  const seen = new Set<string>();
  for (const row of (projects as any[] | null) ?? []) {
    if (Array.isArray(row.tags)) {
      for (const t of row.tags as string[]) if (t) seen.add(t);
    }
  }
  return [...seen].sort();
}

/** 新增项目任务（todo）；可为 phase / section / task，缺省为 task */
export async function createProjectTodo(params: {
  orderId: string;
  parentId?: string | null;
  type: FirmProject['type'];
  title: string;
  description?: string | null;
  sortOrder?: number;
  /** phase / section / task，缺省 task */
  itemKind?: 'phase' | 'section' | 'task';
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
  const kind = params.itemKind ?? 'task';
  const isFirmSide = params.type === 'firm';
  const status: FirmProject['status'] =
    kind === 'task'
      ? (isFirmSide ? 'in_progress' : 'to_submit')
      : 'completed';
  const { data, error } = await supabase
    .from('project_todos')
    .insert({
      project_id: projectId,
      parent_id: params.parentId ?? null,
      responsible_side: params.type,
      initial_responsible_side: params.type,
      title: params.title,
      description: params.description ?? null,
      status,
      item_kind: kind,
      sort_order: params.sortOrder ?? nextOrder,
    })
    .select('id')
    .single();
  if (error) {
    console.error('createProjectTodo:', error);
    return { id: null, error: error as Error };
  }
  await touchFirmOrderUpdatedAt(params.orderId);
  return { id: (data as any)?.id ?? null, error: null };
}

/** 更新项目任务 */
export async function updateProjectTodo(
  todoId: string,
  payload: { title?: string; description?: string | null; status?: FirmProject['status']; sortOrder?: number; parentId?: string | null; type?: 'client' | 'firm' }
): Promise<{ error: Error | null }> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.title !== undefined) updates.title = payload.title;
  if (payload.description !== undefined) updates.description = payload.description;
  if (payload.status !== undefined) updates.status = payload.status;
  if (payload.sortOrder !== undefined) updates.sort_order = payload.sortOrder;
  if (payload.parentId !== undefined) updates.parent_id = payload.parentId;
  if (payload.type !== undefined) updates.responsible_side = payload.type;
  const { error } = await supabase.from('project_todos').update(updates).eq('id', todoId);
  if (error) {
    console.error('updateProjectTodo:', error);
    return { error: error as Error };
  }
  await touchFirmOrderUpdatedAtByTodoId(todoId);
  return { error: null };
}

/**
 * 为进行中的项目设置或清除某个 todo 节点的前置依赖（depends_on_ids 数组）。
 * 传 null 或 [] = 清除；传 id 数组 = 设置多前置（调用方应保证无循环依赖）。
 */
export async function updateProjectTodoDependsOn(
  todoId: string,
  dependsOnIds: string[] | null,
): Promise<{ error: Error | null }> {
  const ids = dependsOnIds?.length ? dependsOnIds : [];
  const payload: { depends_on_ids?: string[]; depends_on_id?: string | null; updated_at: string } = {
    depends_on_ids: ids,
    depends_on_id: ids[0] ?? null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('project_todos')
    .update(payload)
    .eq('id', todoId);
  if (error) return { error: new Error(error.message) };
  await touchFirmOrderUpdatedAtByTodoId(todoId);
  return { error: null };
}

/** 记录项目任务责任方流转历史，并更新当前责任方；可选 newStatus 同步更新状态（如 Submit→Reviewing、Confirm→Completed）。责任方不变时（如 Confirm）不写历史。 */
export async function changeProjectTodoResponsibleSide(params: {
  todoId: string;
  fromSide: FirmProjectType;
  toSide: FirmProjectType;
  note?: string | null;
  newStatus?: FirmProject['status'];
}): Promise<{ error: Error | null }> {
  const cleanedNote = params.note && params.note.trim().length > 0 ? params.note.trim() : null;

  if (params.fromSide !== params.toSide) {
    const { error: histErr } = await supabase
      .from('project_todo_responsible_history')
      .insert({
        project_todo_id: params.todoId,
        from_side: params.fromSide,
        to_side: params.toSide,
        note: cleanedNote,
      });
    if (histErr) {
      console.error('changeProjectTodoResponsibleSide history:', histErr);
      return { error: histErr as Error };
    }
  }

  const payload: { type?: FirmProjectType; status?: FirmProject['status'] } = {};
  if (params.fromSide !== params.toSide) payload.type = params.toSide;
  if (params.newStatus != null) payload.status = params.newStatus;
  return await updateProjectTodo(params.todoId, payload);
}

/** 删除项目任务（Phase 1：仅允许叶子节点，即无子节点） */
export async function deleteProjectTodo(todoId: string): Promise<{ error: Error | null }> {
  const { data: children } = await supabase.from('project_todos').select('id').eq('parent_id', todoId).limit(1);
  if (children && (children as any[]).length > 0) {
    return { error: new Error('Only leaf tasks can be deleted') };
  }
  // 先记录所属订单，后续用于刷新 Updated 字段
  await touchFirmOrderUpdatedAtByTodoId(todoId);
  const { error } = await supabase.from('project_todos').delete().eq('id', todoId);
  if (error) {
    console.error('deleteProjectTodo:', error);
    return { error: error as Error };
  }
  return { error: null };
}

/** 删除 phase 及其所有子级（先递归删除子节点，再删本节点） */
export async function deleteProjectTodoWithChildren(todoId: string): Promise<{ error: Error | null }> {
  // 记录一次所属订单，整个子树删除后统一刷新 Updated
  await touchFirmOrderUpdatedAtByTodoId(todoId);
  const { data: children } = await supabase.from('project_todos').select('id').eq('parent_id', todoId);
  for (const row of children ?? []) {
    const childId = (row as { id: string }).id;
    const err = await deleteProjectTodoWithChildren(childId);
    if (err.error) return err;
  }
  const { error } = await supabase.from('project_todos').delete().eq('id', todoId);
  if (error) {
    console.error('deleteProjectTodoWithChildren:', error);
    return { error: error as Error };
  }
  return { error: null };
}

/** 附件列表项预览：用于 todo 下多列卡片展示，兼容不同 doc 结构 */
export interface AttachmentPreviewField {
  label: string;
  value: string;
}

/** 任务关联的文件摘要，用于 Todos 页 task 下文件列表（含识别结果预览） */
export interface ProjectTodoReceiptSummary {
  id: string;
  name: string;
  imageUrl?: string | null;
  docType?: string | null;
  status?: string;
  /** 识别失败次数（后端列 recognition_fail_count，用于前端展示「失败/再次失败/三次失败」） */
  failCount?: number;
  /** 识别结果摘要字段，用于列表卡片展示（currency、tax_year、issuer 等） */
  extractedPreview?: AttachmentPreviewField[];
  /** 上传时间（ISO 字符串） */
  createdAt?: string | null;
  /** 上传者姓名（纯文本，表 uploader_name），用于行内展示 */
  uploaderName?: string | null;
}

export function buildExtractedPreview(extracted_data: unknown): AttachmentPreviewField[] {
  if (!extracted_data || typeof extracted_data !== 'object') return [];
  const obj = extracted_data as Record<string, unknown>;
  const out: AttachmentPreviewField[] = [];
  const meta = obj.metadata as Record<string, unknown> | undefined;
  if (meta && typeof meta === 'object') {
    if (meta.currency != null) out.push({ label: 'Currency', value: String(meta.currency) });
    if (meta.tax_year != null) out.push({ label: 'Tax year', value: String(meta.tax_year) });
    if (meta.issuer != null) out.push({ label: 'Issuer', value: String(meta.issuer) });
  }
  const skip = new Set(['metadata']);
  let count = 0;
  for (const k of Object.keys(obj)) {
    if (skip.has(k) || count >= 4) continue;
    const v = obj[k];
    if (v == null) continue;
    if (typeof v === 'string' || typeof v === 'number') {
      out.push({ label: k.replace(/_/g, ' '), value: String(v) });
      count++;
    } else if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      const flat = JSON.stringify(v);
      if (flat.length <= 40) {
        out.push({ label: k.replace(/_/g, ' '), value: flat });
        count++;
      }
    }
  }
  return out;
}

/** 获取某 project_todo 关联的附件列表（project_todo_attachments） */
export async function getAttachmentsByProjectTodoId(projectTodoId: string): Promise<ProjectTodoReceiptSummary[]> {
  const { data: rows, error } = await supabase
    .from('project_todo_attachments')
    .select('id, attachment_url, summary, status, doc_type, extracted_data, created_at, uploader_name, recognition_fail_count')
    .eq('project_todo_id', projectTodoId)
    .order('created_at', { ascending: true });
  if (error || !rows?.length) return [];
  return (rows as any[]).map((r) => {
    const status: string = r.status ?? 'PENDING_AI';
    const failCount: number = typeof r.recognition_fail_count === 'number' ? r.recognition_fail_count : 0;
    let name: string;
    if (r.summary && String(r.summary).trim()) {
      name = String(r.summary).trim();
    } else if (status === 'PENDING_AI' || status === 'PROCESSING') {
      name = 'Processing...';
    } else if (status === 'FAILED_ONCE') {
      name = 'Recognition failed (1/3)';
    } else if (status === 'FAILED_TWICE') {
      name = 'Recognition failed (2/3)';
    } else if (status === 'FAILED_FINAL') {
      name = 'Recognition failed (3/3)';
    } else {
      name = 'Attachment';
    }
    return {
      id: r.id,
      name,
      imageUrl: r.attachment_url ?? null,
      docType: r.doc_type ?? null,
      status,
      failCount,
      extractedPreview: buildExtractedPreview(r.extracted_data),
      createdAt: r.created_at ?? null,
      uploaderName: r.uploader_name ?? null,
    };
  });
}

/** 批量获取多个 project_todo 关联的附件（key = todoId） */
export async function getAttachmentsByProjectTodoIds(
  projectTodoIds: string[]
): Promise<Record<string, ProjectTodoReceiptSummary[]>> {
  if (projectTodoIds.length === 0) return {};
  const { data: rows, error } = await supabase
    .from('project_todo_attachments')
    .select('id, project_todo_id, attachment_url, summary, status, doc_type, extracted_data, created_at, uploader_name, recognition_fail_count')
    .in('project_todo_id', projectTodoIds)
    .order('created_at', { ascending: true });
  if (error || !rows?.length) return {};
  const out: Record<string, ProjectTodoReceiptSummary[]> = {};
  projectTodoIds.forEach((id) => { out[id] = []; });
  (rows as any[]).forEach((r) => {
    const todoId = r.project_todo_id;
    if (!out[todoId]) out[todoId] = [];
    const status: string = r.status ?? 'PENDING_AI';
    const failCount: number = typeof r.recognition_fail_count === 'number' ? r.recognition_fail_count : 0;
    let name: string;
    if (r.summary && String(r.summary).trim()) {
      name = String(r.summary).trim();
    } else if (status === 'PENDING_AI' || status === 'PROCESSING') {
      name = 'Processing...';
    } else if (status === 'FAILED_ONCE') {
      name = 'Recognition failed (1/3)';
    } else if (status === 'FAILED_TWICE') {
      name = 'Recognition failed (2/3)';
    } else if (status === 'FAILED_FINAL') {
      name = 'Recognition failed (3/3)';
    } else {
      name = 'Attachment';
    }
    out[todoId].push({
      id: r.id,
      name,
      imageUrl: r.attachment_url ?? null,
      docType: r.doc_type ?? null,
      status,
      failCount,
      extractedPreview: buildExtractedPreview(r.extracted_data),
      createdAt: r.created_at ?? null,
      uploaderName: r.uploader_name ?? null,
    });
  });
  return out;
}

/** 创建任务附件（上传文件到任务后调用）；attachment_url 为 Storage 公网 URL */
export type ProjectTodoAttachmentStatus =
  | 'PENDING_AI'
  | 'PROCESSING'
  | 'FAILED_ONCE'
  | 'FAILED_TWICE'
  | 'FAILED_FINAL'
  | 'PROCESSED'
  | 'VERIFIED';

export async function createProjectTodoAttachment(
  projectTodoId: string,
  attachmentUrl: string,
  opts?: { status?: ProjectTodoAttachmentStatus; summary?: string; doc_type?: string; uploader_name?: string | null }
): Promise<{ id: string } | { error: Error }> {
  const { data, error } = await supabase
    .from('project_todo_attachments')
    .insert({
      project_todo_id: projectTodoId,
      attachment_url: attachmentUrl,
      status: opts?.status ?? 'PENDING_AI',
      summary: opts?.summary ?? null,
      doc_type: opts?.doc_type ?? null,
      uploader_name: opts?.uploader_name ?? null,
    })
    .select('id')
    .single();
  if (error) return { error: new Error(error.message) };
  await touchFirmOrderUpdatedAtByTodoId(projectTodoId);
  return { id: (data as any).id };
}

/** 更新任务附件（识别完成后：summary、doc_type、extracted_data、status 从 PENDING_AI → PROCESSED/VERIFIED；AI 纠正关联时可更新 project_todo_id） */
export async function updateProjectTodoAttachment(
  attachmentId: string,
  updates: {
    summary?: string | null;
    doc_type?: string | null;
    extracted_data?: unknown;
    status?: ProjectTodoAttachmentStatus;
    project_todo_id?: string;
    recognition_fail_count?: number;
  }
): Promise<{ ok: true } | { error: Error }> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.summary !== undefined) payload.summary = updates.summary;
  if (updates.doc_type !== undefined) payload.doc_type = updates.doc_type;
  if (updates.extracted_data !== undefined) payload.extracted_data = updates.extracted_data;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.project_todo_id !== undefined) payload.project_todo_id = updates.project_todo_id;
  if (updates.recognition_fail_count !== undefined) payload.recognition_fail_count = updates.recognition_fail_count;
  const { error } = await supabase
    .from('project_todo_attachments')
    .update(payload)
    .eq('id', attachmentId);
  if (error) return { error: new Error(error.message) };
  await touchFirmOrderUpdatedAtByAttachmentId(attachmentId);
  return { ok: true };
}

/** 删除任务附件 */
export async function deleteProjectTodoAttachment(attachmentId: string): Promise<{ error: Error | null }> {
  await touchFirmOrderUpdatedAtByAttachmentId(attachmentId);
  const { error } = await supabase
    .from('project_todo_attachments')
    .delete()
    .eq('id', attachmentId);
  if (error) {
    console.error('deleteProjectTodoAttachment:', error);
    return { error: new Error(error.message) };
  }
  return { error: null };
}

/** 获取单条任务附件（用于详情页） */
export async function getProjectTodoAttachmentById(
  attachmentId: string
): Promise<{
  id: string;
  attachment_url: string;
  summary: string | null;
  doc_type: string | null;
  status: string;
  extracted_data: unknown;
  recognition_fail_count?: number;
} | null> {
  const { data, error } = await supabase
    .from('project_todo_attachments')
    .select('id, attachment_url, summary, doc_type, status, extracted_data, recognition_fail_count')
    .eq('id', attachmentId)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as any;
  return {
    id: r.id,
    attachment_url: r.attachment_url,
    summary: r.summary ?? null,
    doc_type: r.doc_type ?? null,
    status: r.status ?? 'PENDING_AI',
    extracted_data: r.extracted_data ?? null,
    recognition_fail_count: r.recognition_fail_count ?? 0,
  };
}

/** 获取附件及其项目/任务上下文，供历史 PENDING_AI 识别：用 project 的 tax_country/tax_scenario + todo 的 phase/section/task 构建提示词后调用 updateProjectTodoAttachment */
export async function getProjectTodoAttachmentWithContext(attachmentId: string): Promise<{
  attachment: { id: string; attachment_url: string; status: string; recognition_fail_count?: number };
  project: { taxCountry: string | null; taxScenario: string | null };
  todoContext: { phase?: string; section?: string; task?: string };
} | null> {
  const { data: att, error: attErr } = await supabase
    .from('project_todo_attachments')
    .select('id, attachment_url, status, project_todo_id')
    .eq('id', attachmentId)
    .maybeSingle();
  if (attErr || !att) return null;
  const todoId = (att as any).project_todo_id;
  const { data: todo, error: todoErr } = await supabase
    .from('project_todos')
    .select('id, project_id, parent_id, title, item_kind')
    .eq('id', todoId)
    .maybeSingle();
  if (todoErr || !todo) return null;
  const projectId = (todo as any).project_id;
  const { data: proj, error: projErr } = await supabase
    .from('projects')
    .select('tax_country, tax_scenario')
    .eq('id', projectId)
    .maybeSingle();
  if (projErr || !proj) return null;
  const { data: todosFlat } = await supabase
    .from('project_todos')
    .select('id, parent_id, title, item_kind')
    .eq('project_id', projectId);
  const byId = new Map<string, { parent_id: string | null; title: string; item_kind: string }>();
  (todosFlat || []).forEach((t: any) => byId.set(t.id, { parent_id: t.parent_id, title: t.title ?? '', item_kind: t.item_kind ?? 'task' }));
  const todoContext: { phase?: string; section?: string; task?: string } = {};
  let curId: string | null = todoId;
  const path: { title: string; item_kind: string }[] = [];
  while (curId) {
    const node = byId.get(curId);
    if (!node) break;
    path.push({ title: node.title, item_kind: node.item_kind });
    curId = node.parent_id;
  }
  path.reverse();
  path.forEach((p) => {
    if (p.item_kind === 'phase') todoContext.phase = p.title;
    else if (p.item_kind === 'section') todoContext.section = p.title;
    else if (p.item_kind === 'task') todoContext.task = p.title;
  });
  return {
    attachment: { id: (att as any).id, attachment_url: (att as any).attachment_url, status: (att as any).status },
    project: { taxCountry: (proj as any).tax_country ?? null, taxScenario: (proj as any).tax_scenario ?? null },
    todoContext,
  };
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

  return rows.map((row: any) => {
    const templateStatus = row.template_status === 'draft' || row.template_status === 'private' || row.template_status === 'published' ? row.template_status : null;
    return {
      id: row.id,
      firmSpaceId: row.firm_space_id,
      name: row.name,
      description: row.description ?? undefined,
      imageUrl: row.image_url ?? null,
      isPublished: row.is_published ?? false,
      templateStatus: templateStatus ?? undefined,
      itemsCount: itemsCountMap[row.id] ?? 0,
      taxCountry: row.tax_country ?? null,
      taxScenario: row.tax_scenario ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

/** Firm 空间：删除单个服务 SKU 及其关联的 sku_items */
export async function deleteFirmSku(firmSkuId: string): Promise<void> {
  // 先删 sku_items，再删 skus（即使数据库有 ON DELETE CASCADE，这里也显式清理，避免残留）
  const { error: itemsErr } = await supabase
    .schema('firm')
    .from('sku_items')
    .delete()
    .eq('sku_id', firmSkuId);
  if (itemsErr) {
    console.error('deleteFirmSku sku_items:', itemsErr);
  }

  const { error } = await supabase
    .schema('firm')
    .from('skus')
    .delete()
    .eq('id', firmSkuId);
  if (error) {
    console.error('deleteFirmSku skus:', error);
  }
}

/** Firm 空间：更新 SKU（名称、介绍、封面图、报税国别与场景、模板状态） */
export async function updateFirmSku(
  skuId: string,
  payload: {
    name?: string;
    description?: string | null;
    imageUrl?: string | null;
    isPublished?: boolean;
    templateStatus?: 'draft' | 'private' | 'published';
    taxCountry?: string | null;
    taxScenario?: string | null;
  }
): Promise<{ error: Error | null }> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.name !== undefined) updates.name = payload.name;
  if (payload.description !== undefined) updates.description = payload.description;
  if (payload.imageUrl !== undefined) updates.image_url = payload.imageUrl;
  if (payload.templateStatus !== undefined) {
    updates.template_status = payload.templateStatus;
    updates.is_published = payload.templateStatus === 'published';
  } else if (payload.isPublished !== undefined) {
    updates.is_published = payload.isPublished;
  }
  if (payload.taxCountry !== undefined) updates.tax_country = payload.taxCountry;
  if (payload.taxScenario !== undefined) updates.tax_scenario = payload.taxScenario;
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

/** 将预设 SKU（preset_skus + preset_sku_items）复制到指定 firm 空间；仅该空间成员可调用。
 * 当前 DB 为单参数 apply_preset_skus_to_firm(p_firm_space_id)，复制全部 preset 行；locale 保留供日后多语言版本使用。 */
export async function applyPresetSkusToFirm(
  firmSpaceId: string,
  _locale?: 'zh' | 'en'
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc('apply_preset_skus_to_firm', {
    p_firm_space_id: firmSpaceId,
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
    type: row.initial_responsible_side,
    title: row.title,
    description: row.description ?? null,
    sortOrder: row.sort_order ?? 0,
    dependsOnId: row.depends_on_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  return sortSkuItemsDepthFirst(mapped);
}

/**
 * 设置或清除 sku_item 的前置依赖（depends_on_id）。
 * 传 null 表示清除依赖（该 item 无前置条件，立即可操作）。
 */
export async function updateSkuItemDependsOn(
  skuItemId: string,
  dependsOnId: string | null,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .schema('firm')
    .from('sku_items')
    .update({ depends_on_id: dependsOnId })
    .eq('id', skuItemId);
  if (error) return { error: new Error(error.message) };
  return { error: null };
}

/** 新增 SKU item（阶段 / 分类 / 任务）；sortOrder 默认排到同级末尾 */
export async function createSkuItem(params: {
  skuId: string;
  parentId?: string | null;
  itemKind: 'phase' | 'section' | 'task';
  type: 'client' | 'firm';
  title: string;
  description?: string | null;
}): Promise<{ id: string | null; error: Error | null }> {
  // 取同级末尾 sort_order
  const q = supabase.schema('firm').from('sku_items').select('sort_order').eq('sku_id', params.skuId);
  if (params.parentId) q.eq('parent_id', params.parentId); else q.is('parent_id', null);
  const { data: siblings } = await q.order('sort_order', { ascending: false }).limit(1).maybeSingle();
  const sortOrder = (siblings as any)?.sort_order != null ? (siblings as any).sort_order + 1 : 1;

  const { data, error } = await supabase.schema('firm').from('sku_items').insert({
    sku_id: params.skuId,
    parent_id: params.parentId ?? null,
    item_kind: params.itemKind,
    initial_responsible_side: params.type,
    title: params.title,
    description: params.description ?? null,
    sort_order: sortOrder,
  }).select('id').maybeSingle();
  if (error) {
    console.error('createSkuItem:', error);
    return { id: null, error: error as Error };
  }
  return { id: (data as any)?.id ?? null, error: null };
}

/** 更新 SKU item 字段 */
export async function updateSkuItem(
  itemId: string,
  payload: {
    title?: string;
    description?: string | null;
    type?: 'client' | 'firm';
    itemKind?: 'phase' | 'section' | 'task';
    sortOrder?: number;
    parentId?: string | null;
  }
): Promise<{ error: Error | null }> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.title !== undefined) updates.title = payload.title;
  if (payload.description !== undefined) updates.description = payload.description;
  if (payload.type !== undefined) updates.initial_responsible_side = payload.type;
  if (payload.itemKind !== undefined) updates.item_kind = payload.itemKind;
  if (payload.sortOrder !== undefined) updates.sort_order = payload.sortOrder;
  if (payload.parentId !== undefined) updates.parent_id = payload.parentId;
  const { error } = await supabase.schema('firm').from('sku_items').update(updates).eq('id', itemId);
  if (error) {
    console.error('updateSkuItem:', error);
    return { error: error as Error };
  }
  return { error: null };
}

/** 删除 SKU item（会级联删除子节点，由数据库 ON DELETE CASCADE 保证） */
export async function deleteSkuItem(itemId: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.schema('firm').from('sku_items').delete().eq('id', itemId);
  if (error) {
    console.error('deleteSkuItem:', error);
    return { error: error as Error };
  }
  return { error: null };
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
    kind: (row.kind ?? 'note') as FirmClientFollowUp['kind'],
    referenceId: row.reference_id ?? null,
    createdAt: row.created_at,
    createdBy: row.created_by ?? null,
  }));
}

/** Firm 空间：新增客户跟进记录（插入后 trigger 会更新 clients.updated_at） */
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

/** 更新客户自定义标签（clients.labels 文本数组） */
export async function updateFirmClientLabels(
  clientId: string,
  labels: string[]
): Promise<{ error: Error | null }> {
  const arr = Array.isArray(labels) ? labels.filter((s) => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim()) : [];
  const { error } = await supabase
    .schema('firm')
    .from('clients')
    .update({ labels: arr, updated_at: new Date().toISOString() })
    .eq('id', clientId);
  return { error: error ? new Error(error.message) : null };
}

/** 当前用户是否为 Firm 空间的 admin（仅 admin 可更换客户负责人） */
export async function isFirmSpaceAdmin(firmSpaceId: string): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  const uid = user?.id;
  if (!uid) return false;
  const { data, error } = await supabase
    .from('user_spaces')
    .select('is_admin')
    .eq('space_id', firmSpaceId)
    .eq('user_id', uid)
    .maybeSingle();
  if (error || !data) return false;
  return (data as { is_admin: boolean }).is_admin === true;
}

/** Firm 空间成员（用于 Assign 选单）：id=user_id, name/email 来自 public.users */
export type FirmSpaceMember = { id: string; name: string | null; email: string | null };

/** 获取 Firm 空间下所有成员（user_spaces + users），用于负责人选单 */
export async function getFirmSpaceMembers(firmSpaceId: string): Promise<FirmSpaceMember[]> {
  const { data: usRows, error: usErr } = await supabase
    .from('user_spaces')
    .select('user_id')
    .eq('space_id', firmSpaceId);
  if (usErr || !usRows?.length) return [];
  const userIds = [...new Set((usRows as { user_id: string }[]).map((r) => r.user_id))];
  const { data: users, error: uErr } = await supabase
    .from('users')
    .select('id, name, email')
    .in('id', userIds);
  if (uErr || !users?.length) return [];
  return (users as { id: string; name: string | null; email: string | null }[]).map((u) => ({
    id: u.id,
    name: u.name ?? null,
    email: u.email ?? null,
  }));
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
  if (error) return { error: new Error(error.message) };
  await touchFirmOrderUpdatedAtByTodoId(projectId);
  return { error: null };
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
