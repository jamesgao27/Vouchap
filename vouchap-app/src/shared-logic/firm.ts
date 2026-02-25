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
  FirmSku,
  FirmSkuItem,
  FirmTemplate,
} from '@/types';

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
  const hasCurrentYearInProgress = currentYearOrders.some((o) => o.status === 'pending' || o.status === 'submitted');
  const hasLastYearConfirmed = lastYearOrders.some((o) => o.status === 'confirmed');

  if (!hasAnyOrder) return 'new';
  if (ctx.taxSeasonEnded && !hasCurrentYearInProgress) return 'churned';
  if (hasCurrentYearInProgress) return 'in_service';
  if (ctx.taxSeasonStarted && !hasCurrentYearInProgress) return 'to_follow_up';
  if (hasLastYearConfirmed) return 'to_revisit';
  return 'to_follow_up';
}

/** 客户端空间：获取推送给本空间的待办（订单项 type=client，订单状态 pending/submitted） */
export async function getClientTodosForClientSpace(clientSpaceId: string): Promise<FirmClientTodo[]> {
  const { data: ordersData, error: ordersErr } = await supabase
    .schema('firm')
    .from('orders')
    .select('id, firm_space_id, client_space_id, due_at, created_at')
    .eq('client_space_id', clientSpaceId)
    .in('status', ['pending', 'submitted'])
    .order('due_at', { ascending: true, nullsFirst: false });

  if (ordersErr || !ordersData?.length) {
    if (ordersErr) console.error('getClientTodosForClientSpace orders:', ordersErr);
    return [];
  }

  const orderIds = ordersData.map((o: any) => o.id);
  const { data: itemsData, error: itemsErr } = await supabase
    .schema('firm')
    .from('project_todos')
    .select('*')
    .in('order_id', orderIds)
    .eq('type', 'client')
    .order('sort_order', { ascending: true });

  if (itemsErr) {
    console.error('getClientTodosForClientSpace projects:', itemsErr);
    return [];
  }

  const orderMap: Record<string, any> = {};
  ordersData.forEach((o: any) => { orderMap[o.id] = o; });

  return (itemsData || []).map((row: any) => {
    const order = orderMap[row.order_id];
    return {
      id: row.id,
      orderId: row.order_id,
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

/** 客户端空间：获取本空间的所有订单（用于报税模块显示），附带 sku 名称 */
export async function getClientOrdersForClientSpace(clientSpaceId: string): Promise<Array<FirmOrder & { skuName?: string }>> {
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

  const skuIds = Array.from(new Set(ordersData.map((o: any) => o.sku_id)));
  const { data: skusData, error: skusErr } = await supabase
    .schema('firm')
    .from('skus')
    .select('id, name')
    .in('id', skuIds);

  if (skusErr) {
    console.error('getClientOrdersForClientSpace skus:', skusErr);
  }

  const skuMap: Record<string, string> = {};
  (skusData || []).forEach((s: any) => {
    skuMap[s.id] = s.name || '';
  });

  return (ordersData || []).map((row: any) => ({
    id: row.id,
    firmSpaceId: row.firm_space_id,
    clientSpaceId: row.client_space_id,
    skuId: row.sku_id,
    status: row.status,
    dueAt: row.due_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by ?? null,
    skuName: skuMap[row.sku_id] ?? undefined,
  }));
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
    assignedUserId: row.assigned_user_id ?? null,
    lastFollowUpAt: row.last_follow_up_at ?? null,
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

  const [spacesRes, userSpacesRes, ordersRes, memberClientsRes] = await Promise.all([
    supabase.from('spaces').select('id, name').in('id', spaceIds),
    supabase.from('user_spaces').select('space_id, user_id').in('space_id', spaceIds).eq('is_admin', true),
    supabase.schema('firm').from('orders').select('client_space_id, status, due_at, created_at').eq('firm_space_id', firmSpaceId),
    supabase.schema('firm').from('member_clients').select('client_space_id, user_id').eq('firm_space_id', firmSpaceId),
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

/** Firm 空间：创建订单（初始为 pending，仅记录 SKU，projects 需待客户确认后再创建） */
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
      status: 'pending',
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

/** 客户端确认订单：根据 SKU items 创建 project_todos，并将订单标记为 confirmed */
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

  const { data: items, error: itemsErr } = await supabase
    .schema('firm')
    .from('sku_items')
    .select('*')
    .eq('sku_id', order.sku_id)
    .order('sort_order', { ascending: true });

  if (itemsErr) {
    return { error: new Error(itemsErr.message) };
  }

  if (!items || items.length === 0) {
    // 没有模板项时，只更新订单状态
    const { error } = await updateOrderStatus(orderId, 'confirmed');
    return { error };
  }

  const payload = items.map((row: any) => ({
    order_id: order.id,
    type: row.type,
    title: row.title,
    description: row.description ?? null,
    status: 'pending' as FirmProjectStatus,
    sort_order: row.sort_order ?? 0,
  }));

  const { error: insertErr } = await supabase
    .schema('firm')
    .from('project_todos')
    .insert(payload);

  if (insertErr) {
    return { error: new Error(insertErr.message) };
  }

  const { error: updateErr } = await updateOrderStatus(orderId, 'confirmed');
  return { error: updateErr };
}

/** Firm 空间：获取某订单的 projects（客户 todo + firm todo，由 sku_items 复制） */
export async function getOrderProjects(orderId: string): Promise<FirmProject[]> {
  const { data, error } = await supabase
    .schema('firm')
    .from('project_todos')
    .select('*')
    .eq('order_id', orderId)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('getOrderProjects:', error);
    return [];
  }
  return (data || []).map((row: any) => ({
    id: row.id,
    orderId: row.order_id,
    type: row.type,
    title: row.title,
    description: row.description ?? null,
    status: row.status,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/** Firm 空间：获取某客户或全部客户的「待办」列表（订单项扁平，兼容原 todo 页） */
export async function getFirmClientTodos(
  firmSpaceId: string,
  clientSpaceId?: string
): Promise<FirmClientTodo[]> {
  const orders = await getFirmOrders(firmSpaceId, clientSpaceId);
  if (orders.length === 0) return [];

  const orderIds = orders.map((o) => o.id);
  const { data: itemsData, error: itemsErr } = await supabase
    .schema('firm')
    .from('project_todos')
    .select('*')
    .in('order_id', orderIds)
    .order('sort_order', { ascending: true });

  if (itemsErr) {
    console.error('getFirmClientTodos projects:', itemsErr);
    return [];
  }

  const orderMap: Record<string, FirmOrder> = {};
  orders.forEach((o) => { orderMap[o.id] = o; });

  const items = (itemsData || []).map((row: any) => {
    const order = orderMap[row.order_id];
    return {
      id: row.id,
      orderId: row.order_id,
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
  return (data || []).map((row: any) => ({
    id: row.id,
    firmSpaceId: row.firm_space_id,
    name: row.name,
    description: row.description ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/** Firm 空间：获取 SKU 关联的 sku_items（创建订单时复制到 projects） */
export async function getSkuItems(skuId: string): Promise<FirmSkuItem[]> {
  const { data, error } = await supabase
    .schema('firm')
    .from('sku_items')
    .select('*')
    .eq('sku_id', skuId)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('getSkuItems:', error);
    return [];
  }
  return (data || []).map((row: any) => ({
    id: row.id,
    skuId: row.sku_id,
    type: row.type,
    title: row.title,
    description: row.description ?? null,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/** Firm 空间：获取「模板」列表（兼容：即 SKU 列表，带 items 来自 sku_items） */
export async function getFirmTemplates(firmSpaceId: string): Promise<FirmTemplate[]> {
  const skus = await getFirmSkus(firmSpaceId);
  if (skus.length === 0) return [];

  const skuIds = skus.map((s) => s.id);
  const { data: itemsData } = await supabase
    .schema('firm')
    .from('sku_items')
    .select('sku_id, title, description')
    .in('sku_id', skuIds)
    .order('sort_order', { ascending: true });

  const itemsBySku: Record<string, Array<{ title: string; description?: string }>> = {};
  (itemsData || []).forEach((row: any) => {
    if (!itemsBySku[row.sku_id]) itemsBySku[row.sku_id] = [];
    itemsBySku[row.sku_id].push({ title: row.title ?? '', description: row.description ?? undefined });
  });

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
  const { error } = await supabase
    .schema('firm')
    .from('clients')
    .update({ assigned_user_id: assignedUserId, updated_at: new Date().toISOString() })
    .eq('id', clientId);
  return { error: error ? new Error(error.message) : null };
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

/** 更新 project 状态（订单下某清单项；整单进展以 order.status 为准） */
export async function updateProjectStatus(
  projectId: string,
  status: FirmProject['status']
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .schema('firm')
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

/** 兼容：按 project id 更新状态（原 updateClientTodoStatus） */
export async function updateClientTodoStatus(
  id: string,
  status: 'pending' | 'submitted' | 'confirmed'
): Promise<{ error: Error | null }> {
  return updateProjectStatus(id, status);
}
