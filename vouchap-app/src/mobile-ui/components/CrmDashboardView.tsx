/**
 * Firm Insights dashboard (web-first).
 * Four analytic charts:
 * 1) Clients by status (pie)
 * 2) Clients by assignee (horizontal bar)
 * 3) Engagements by status (bar)
 * 4) Follow-ups over time by assignee (line)
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Rect, G, Circle, Text as SvgText } from 'react-native-svg';
import { getCurrentSpace } from '@/lib/auth';
import {
  getFirmClientsWithDetails,
  getFirmOrders,
  getFirmClientFollowUps,
} from '@/lib/firm';
import { supabase } from '@/lib/supabase';
import type { ClientDisplayStatus, FirmOrderStatus } from '@/types';
import type { FirmClientWithDetails, FirmClientFollowUp, FirmOrder } from '@/lib/firm';

const FIRM_CHART_COLORS = ['#6C5CE7', '#00B894', '#0984E3', '#FDCB6E', '#E17055'];

const CLIENT_STATUS_LABELS: Record<ClientDisplayStatus, string> = {
  new: 'New',
  to_follow_up: 'To follow up',
  in_service: 'In service',
  to_revisit: 'To revisit',
  churned: 'Churned',
};

const ORDER_STATUS_LABELS: Record<FirmOrderStatus, string> = {
  pending: 'Pending',
  submitted: 'Submitted',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
};

type FollowUpSeries = {
  assignee: string;
  color: string;
  points: { x: number; y: number }[];
};

export default function CrmDashboardView() {
  const { width: screenWidth } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<FirmClientWithDetails[]>([]);
  const [orders, setOrders] = useState<FirmOrder[]>([]);
  const [followUps, setFollowUps] = useState<FirmClientFollowUp[]>([]);
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (Platform.OS !== 'web') {
      // For mobile we still show this component, but analytics are web-first; keep lightweight.
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const space = await getCurrentSpace(true);
        if (!space || space.kind !== 'firm' || cancelled) {
          setLoading(false);
          return;
        }
        const [clientList, orderList, followUpList] = await Promise.all([
          getFirmClientsWithDetails(space.id),
          getFirmOrders(space.id),
          getFirmClientFollowUps(space.id),
        ]);
        if (cancelled) return;
        setClients(clientList);
        setOrders(orderList);
        setFollowUps(followUpList);

        const authorIds = Array.from(
          new Set(followUpList.map((f) => f.createdBy).filter(Boolean) as string[])
        );
        if (authorIds.length > 0) {
          const { data } = await supabase.from('users').select('id, name, email').in('id', authorIds);
          const map: Record<string, string> = {};
          (data || []).forEach((u: any) => {
            map[u.id] = u.name || u.email || 'Unknown';
          });
          if (!cancelled) setAuthorNames(map);
        }
      } catch (e) {
        console.error('CrmDashboardView load error:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const clientStatusEntries = useMemo(() => {
    const base: Record<ClientDisplayStatus, number> = {
      new: 0,
      to_follow_up: 0,
      in_service: 0,
      to_revisit: 0,
      churned: 0,
    };
    clients.forEach((c) => {
      base[c.displayStatus] = (base[c.displayStatus] ?? 0) + 1;
    });
    return (Object.keys(base) as ClientDisplayStatus[])
      .filter((k) => base[k] > 0)
      .map((k) => [CLIENT_STATUS_LABELS[k], base[k]] as [string, number]);
  }, [clients]);

  const clientAssigneeEntries = useMemo(() => {
    const counts: Record<string, number> = {};
    clients.forEach((c) => {
      const key = c.assigneeName || 'Unassigned';
      counts[key] = (counts[key] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [clients]);

  const orderStatusEntries = useMemo(() => {
    const base: Record<FirmOrderStatus, number> = {
      pending: 0,
      submitted: 0,
      confirmed: 0,
      cancelled: 0,
    };
    orders.forEach((o) => {
      base[o.status] = (base[o.status] ?? 0) + 1;
    });
    return (Object.keys(base) as FirmOrderStatus[])
      .filter((k) => base[k] > 0)
      .map((k) => [ORDER_STATUS_LABELS[k], base[k]] as [string, number]);
  }, [orders]);

  const followUpSeries = useMemo<FollowUpSeries[]>(() => {
    if (followUps.length === 0) return [];
    const byDateAuthor: Record<string, Record<string, number>> = {};
    const allDates = new Set<string>();
    followUps.forEach((f) => {
      const date = f.createdAt?.slice(0, 10) || '';
      if (!date) return;
      allDates.add(date);
      const authorId = f.createdBy || 'unknown';
      const name = authorNames[authorId] || 'Unassigned';
      if (!byDateAuthor[name]) byDateAuthor[name] = {};
      byDateAuthor[name][date] = (byDateAuthor[name][date] ?? 0) + 1;
    });
    const dates = Array.from(allDates).sort();
    if (dates.length === 0) return [];

    const totals: Record<string, number> = {};
    Object.entries(byDateAuthor).forEach(([name, map]) => {
      totals[name] = Object.values(map).reduce((s, v) => s + v, 0);
    });
    const topAuthors = Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name]) => name);

    const maxVal = Math.max(
      1,
      ...topAuthors.map((name) => {
        const m = byDateAuthor[name];
        return m ? Math.max(...Object.values(m)) : 0;
      })
    );

    return topAuthors.map((name, idx) => {
      const color = FIRM_CHART_COLORS[idx % FIRM_CHART_COLORS.length];
      const counts = byDateAuthor[name] || {};
      const points = dates.map((d, i) => ({
        x: i,
        y: counts[d] || 0,
      }));
      // Normalize y with maxVal when drawing; here keep raw values.
      return { assignee: name, color, points };
    });
  }, [followUps, authorNames]);

  // Align chart proportions with client dashboard visuals
  const chartWidth = Math.min(screenWidth - 40, 360);
  const pieSize = Math.min(chartWidth, 200);
  const barChartH = 160;
  const lineChartH = 160;

  if (loading && Platform.OS === 'web') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#6C5CE7" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="grid-outline" size={28} color="#6C5CE7" />
        <Text style={styles.title}>Insights</Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {/* Clients by status (pie) */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Clients by status</Text>
            <View style={styles.chartContainer}>
              <ClientStatusPie
                width={chartWidth}
                height={pieSize}
                entries={clientStatusEntries}
              />
            </View>
          </View>

          {/* Clients by assignee (horizontal bar) */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Clients by assignee</Text>
            <View style={styles.chartContainer}>
              <ClientAssigneeBars
                width={chartWidth}
                height={barChartH}
                entries={clientAssigneeEntries}
              />
            </View>
          </View>

          {/* Orders by status (bar) */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Engagements by status</Text>
            <View style={styles.chartContainer}>
              <OrderStatusBars
                width={chartWidth}
                height={barChartH}
                entries={orderStatusEntries}
              />
            </View>
          </View>

          {/* Follow-ups over time by assignee (line) */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Follow-ups over time</Text>
            <View style={styles.chartContainer}>
              <FollowUpLines
                width={chartWidth}
                height={lineChartH}
                series={followUpSeries}
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

type PieProps = {
  width: number;
  height: number;
  entries: [string, number][];
};

function ClientStatusPie({ width, height, entries }: PieProps) {
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const cx = width / 2;
  const cy = height / 2 - 8;
  const r = Math.min(width, height) / 2 - 24;

  if (entries.length === 0) {
    return (
      <Svg width={width} height={height}>
        <SvgText x={width / 2} y={height / 2} textAnchor="middle" fill="#95A5A6" fontSize={14}>
          No data
        </SvgText>
      </Svg>
    );
  }

  let acc = 0;
  return (
    <Svg width={width} height={height} style={{ overflow: 'visible' }}>
      <G>
        {entries.map(([name, val], i) => {
          const ratio = total ? val / total : 0;
          const color = FIRM_CHART_COLORS[i % FIRM_CHART_COLORS.length];
          let slice: JSX.Element;
          if (ratio >= 1 - 1e-9) {
            slice = <Circle key={name} cx={cx} cy={cy} r={r} fill={color} stroke="#fff" strokeWidth={2} />;
          } else {
            const start = acc * 2 * Math.PI - Math.PI / 2;
            const end = (acc + ratio) * 2 * Math.PI - Math.PI / 2;
            const x1 = cx + r * Math.cos(start);
            const y1 = cy + r * Math.sin(start);
            const x2 = cx + r * Math.cos(end);
            const y2 = cy + r * Math.sin(end);
            const large = ratio > 0.5 ? 1 : 0;
            const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
            slice = <Path key={name} d={d} fill={color} stroke="#fff" strokeWidth={2} />;
          }
          acc += ratio;
          return slice;
        })}
        <SvgText x={cx} y={cy + 6} textAnchor="middle" fill="#2D3436" fontSize={13}>
          {total} clients
        </SvgText>
        {entries.slice(0, 5).map(([name, val], i) => (
          <SvgText
            key={name}
            x={width - 12}
            y={20 + i * 16}
            textAnchor="end"
            fill={FIRM_CHART_COLORS[i % FIRM_CHART_COLORS.length]}
            fontSize={11}
          >
            {name} {total ? `${((val / total) * 100).toFixed(0)}%` : ''}
          </SvgText>
        ))}
      </G>
    </Svg>
  );
}

type BarProps = {
  width: number;
  height: number;
  entries: [string, number][];
};

function ClientAssigneeBars({ width, height, entries }: BarProps) {
  if (entries.length === 0) {
    return (
      <Svg width={width} height={height}>
        <SvgText x={width / 2} y={height / 2} textAnchor="middle" fill="#95A5A6" fontSize={14}>
          No data
        </SvgText>
      </Svg>
    );
  }
  const padding = { top: 20, right: 24, bottom: 20, left: 80 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxVal = Math.max(...entries.map(([, v]) => v));
  const rowH = chartH / entries.length;

  return (
    <Svg width={width} height={height} style={{ overflow: 'visible' }}>
      {entries.map(([name, val], i) => {
        const y = padding.top + i * rowH + rowH * 0.2;
        const barH = rowH * 0.6;
        const barW = maxVal ? (val / maxVal) * chartW : 0;
        const color = FIRM_CHART_COLORS[i % FIRM_CHART_COLORS.length];
        const label = name.length > 16 ? `${name.slice(0, 15)}…` : name;
        return (
          <G key={name}>
            <SvgText
              x={padding.left - 8}
              y={y + barH / 2 + 4}
              textAnchor="end"
              fill="#636E72"
              fontSize={11}
            >
              {label}
            </SvgText>
            <Rect
              x={padding.left}
              y={y}
              width={barW}
              height={barH}
              rx={4}
              fill={color}
            />
            <SvgText
              x={padding.left + barW + 6}
              y={y + barH / 2 + 3}
              textAnchor="start"
              fill="#636E72"
              fontSize={10}
            >
              {val}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

function OrderStatusBars({ width, height, entries }: BarProps) {
  if (entries.length === 0) {
    return (
      <Svg width={width} height={height}>
        <SvgText x={width / 2} y={height / 2} textAnchor="middle" fill="#95A5A6" fontSize={14}>
          No data
        </SvgText>
      </Svg>
    );
  }
  const padding = { top: 20, right: 16, bottom: 28, left: 16 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxVal = Math.max(...entries.map(([, v]) => v));
  const n = entries.length;
  const colW = chartW / n;
  const barW = Math.max(18, Math.min(colW * 0.65, 44));

  return (
    <Svg width={width} height={height} style={{ overflow: 'visible' }}>
      {entries.map(([name, val], i) => {
        const colCenterX = padding.left + (i + 0.5) * colW;
        const barX = colCenterX - barW / 2;
        const barHeight = maxVal ? (val / maxVal) * chartH : 0;
        const barY = padding.top + chartH - barHeight;
        const label = name.length > 10 ? `${name.slice(0, 9)}…` : name;
        const color = FIRM_CHART_COLORS[i % FIRM_CHART_COLORS.length];
        return (
          <G key={name}>
            <Rect x={barX} y={barY} width={barW} height={barHeight} rx={4} fill={color} />
            <SvgText
              x={colCenterX}
              y={height - 8}
              textAnchor="middle"
              fill="#636E72"
              fontSize={10}
            >
              {label}
            </SvgText>
            <SvgText
              x={colCenterX}
              y={barY - 4}
              textAnchor="middle"
              fill="#2D3436"
              fontSize={10}
            >
              {val}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

type LineProps = {
  width: number;
  height: number;
  series: FollowUpSeries[];
};

function FollowUpLines({ width, height, series }: LineProps) {
  if (series.length === 0) {
    return (
      <Svg width={width} height={height}>
        <SvgText x={width / 2} y={height / 2} textAnchor="middle" fill="#95A5A6" fontSize={14}>
          No data
        </SvgText>
      </Svg>
    );
  }

  const padding = { top: 16, right: 60, bottom: 24, left: 32 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const maxY = Math.max(
    1,
    ...series.flatMap((s) => s.points.map((p) => p.y))
  );
  const maxX = Math.max(
    1,
    ...series.flatMap((s) => s.points.map((p) => p.x))
  );

  return (
    <Svg width={width} height={height} style={{ overflow: 'visible' }}>
      {/* X-axis */}
      <Path
        d={`M ${padding.left} ${padding.top + chartH} H ${padding.left + chartW}`}
        stroke="#E5E7EB"
        strokeWidth={1}
      />
      {/* Y-axis */}
      <Path
        d={`M ${padding.left} ${padding.top} V ${padding.top + chartH}`}
        stroke="#E5E7EB"
        strokeWidth={1}
      />
      {series.map((s, idx) => {
        const pathD = s.points
          .map((p, i) => {
            const x = padding.left + (p.x / maxX) * chartW;
            const y = padding.top + chartH - (p.y / maxY) * chartH;
            return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
          })
          .join(' ');
        return (
          <G key={s.assignee}>
            <Path d={pathD} stroke={s.color} strokeWidth={2} fill="none" />
          </G>
        );
      })}
      {/* Legend (top-right) */}
      {series.slice(0, 4).map((s, i) => (
        <G key={s.assignee}>
          <Rect
            x={width - padding.right + 8}
            y={padding.top + i * 16 - 8}
            width={8}
            height={8}
            rx={2}
            fill={s.color}
          />
          <SvgText
            x={width - padding.right + 20}
            y={padding.top + i * 16}
            textAnchor="start"
            fill="#636E72"
            fontSize={10}
          >
            {s.assignee.length > 12 ? `${s.assignee.slice(0, 11)}…` : s.assignee}
          </SvgText>
        </G>
      ))}
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 24 : 16,
    paddingBottom: 8,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#2D3436', marginLeft: 10 },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 32,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 24,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
    marginBottom: 4,
    width: '100%',
    ...(Platform.OS === 'web'
      ? {
          flexBasis: '48%',
          maxWidth: '48%',
        }
      : null),
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2D3436',
    marginBottom: 8,
  },
  chartContainer: {
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F9FA',
  },
});
