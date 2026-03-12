import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import type { FirmSku } from '@/types';
import { supabase } from '@/lib/supabase';

type Props = {
  sku?: FirmSku | null;
};

type SkuItemRow = {
  id: string;
  sku_id: string;
  parent_id?: string | null;
  item_kind: 'phase' | 'section' | 'task';
  initial_responsible_side: 'client' | 'firm';
  title: string;
  description?: string | null;
  sort_order?: number | null;
};

export default function SkuPreview({ sku }: Props) {
  const [items, setItems] = useState<SkuItemRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!sku?.id) {
      setItems(null);
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .schema('firm')
          .from('sku_items')
          .select('id, sku_id, parent_id, item_kind, initial_responsible_side, title, description, sort_order')
          .eq('sku_id', sku.id)
          .order('sort_order', { ascending: true });
        if (error) {
          console.error('SkuPreview: load sku_items', error);
          if (!cancelled) setItems([]);
          return;
        }
        if (!cancelled) {
          setItems((data || []) as SkuItemRow[]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sku?.id]);

  const hasImage = !!sku?.imageUrl;
  const description = sku?.description || '';

  const header = useMemo(
    () =>
      sku
        ? `${sku.name}${
            sku.taxCountry || sku.taxScenario
              ? ` · ${[sku.taxCountry, sku.taxScenario].filter(Boolean).join(' · ')}`
              : ''
          }`
        : 'No template selected',
    [sku]
  );

  if (!sku) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyTitle}>No service template selected</Text>
        <Text style={styles.emptyDesc}>
          Choose a template on the left to preview its cover, description, and key tasks.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        {hasImage && (
          <Image source={{ uri: sku.imageUrl as string }} style={styles.cover} resizeMode="cover" />
        )}
        <View style={styles.headerText}>
          <Text numberOfLines={2} style={styles.title}>
            {header}
          </Text>
          {description ? (
            <Text numberOfLines={3} style={styles.description}>
              {description}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.todoStub}>
        <Text style={styles.todoStubTitle}>Documents list</Text>
        {loading && (
          <View style={styles.todoLoadingRow}>
            <ActivityIndicator size="small" color="#6C5CE7" />
            <Text style={styles.todoLoadingText}>Loading tasks…</Text>
          </View>
        )}
        {!loading && (!items || items.length === 0) && (
          <Text style={styles.todoStubText}>No template tasks configured yet.</Text>
        )}
        {!loading && items && items.length > 0 && (
          <ScrollView
            style={styles.todoList}
            contentContainerStyle={{ paddingBottom: 4 }}
            showsVerticalScrollIndicator={false}
          >
            {buildCompactWbs(items).map((row) => {
              const isPhase = row.level === 2;
              const isSection = row.level === 3;
              const isTask = row.level === 4;
              const indent = isPhase ? 0 : isSection ? 8 : 16;

              return (
                <View key={row.id} style={[styles.todoRow, { paddingLeft: indent }]}>
                  <Text
                    style={[
                      styles.todoCode,
                      isPhase && styles.todoCodePhase,
                      isSection && styles.todoCodeSection,
                    ]}
                  >
                    {row.code}
                  </Text>

                  {isTask ? (
                    <>
                      <Text
                        style={[
                          styles.todoSide,
                          row.responsibleSide === 'client' ? styles.todoSideClient : styles.todoSideFirm,
                        ]}
                      >
                        {row.responsibleSide === 'client' ? 'Client' : 'Firm'}
                      </Text>
                      <Text style={styles.todoTitle} numberOfLines={1}>
                        {row.title}
                      </Text>
                    </>
                  ) : (
                    // phase / section：不显示责任方，让名称紧跟在编号后面
                    <Text
                      style={[
                        styles.todoTitle,
                        isPhase && styles.todoTitlePhase,
                        isSection && styles.todoTitleSection,
                      ]}
                      numberOfLines={1}
                    >
                      {row.title}
                    </Text>
                  )}
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E4F0',
    backgroundColor: '#FDFBFF',
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 6,
    justifyContent: 'flex-start',
    minHeight: 560,
    maxHeight: 560,
  },
  headerRow: {
    flexDirection: 'row',
    marginBottom: 0,
  },
  cover: {
    width: 120,
    height: 120,
    borderRadius: 8,
    marginRight: 8,
    marginTop: 0,
    marginBottom: 4,
    backgroundColor: '#E5E7EB',
  },
  headerText: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2D3436',
    marginBottom: 2,
  },
  description: {
    fontSize: 13,
    color: '#636E72',
    lineHeight: 18,
    marginBottom: 4,
  },
  descriptionMuted: {
    fontSize: 13,
    color: '#B2BEC3',
    fontStyle: 'italic',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D3436',
    marginBottom: 4,
  },
  emptyDesc: {
    fontSize: 13,
    color: '#B2BEC3',
    lineHeight: 18,
  },
  todoStub: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#EAECEF',
    flex: 1,
  },
  todoStubTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#636E72',
    marginBottom: 2,
  },
  todoStubText: {
    fontSize: 12,
    color: '#A0A4A8',
    lineHeight: 16,
  },
  todoLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  todoLoadingText: {
    fontSize: 12,
    color: '#A0A4A8',
    marginLeft: 6,
  },
  todoList: {
    marginTop: 4,
    flex: 1,
  },
  todoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    borderTopWidth: 0.5,
    borderTopColor: '#ECEFF4',
    paddingTop: 2,
  },
  todoCode: {
    fontFamily: 'System',
    fontSize: 11,
    color: '#636E72',
    minWidth: 28,
  },
  todoCodePhase: {
    fontWeight: '600',
  },
  todoCodeSection: {
    fontWeight: '500',
  },
  todoSide: {
    fontSize: 10,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 6,
    overflow: 'hidden',
  },
  todoSideClient: {
    backgroundColor: '#E3F2FD',
    color: '#1565C0',
  },
  todoSideFirm: {
    backgroundColor: '#E8F5E9',
    color: '#2E7D32',
  },
  todoSidePlaceholder: {
    width: 40,
    marginRight: 6,
  },
  todoTitle: {
    flex: 1,
    fontSize: 11,
    color: '#2D3436',
  },
  todoTitlePhase: {
    fontWeight: '600',
  },
  todoTitleSection: {
    fontWeight: '500',
  },
});

// 将 sku_items 构造成紧凑 WBS 展示：phase / section / task，带编号 + 责任方 + 名称
type CompactRow = {
  id: string;
  code: string;
  level: 2 | 3 | 4;
  responsibleSide: 'client' | 'firm';
  title: string;
};

function buildCompactWbs(items: SkuItemRow[]): CompactRow[] {
  const phases = items.filter((i) => i.item_kind === 'phase').sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const sections = items.filter((i) => i.item_kind === 'section').sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const tasks = items.filter((i) => i.item_kind === 'task').sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const byParent: Record<string, SkuItemRow[]> = {};
  [...sections, ...tasks].forEach((i) => {
    const pid = i.parent_id ?? '';
    if (!byParent[pid]) byParent[pid] = [];
    byParent[pid].push(i);
  });

  const rows: CompactRow[] = [];

  phases.forEach((phase, pi) => {
    const phaseCode = `${pi + 1}`;
    rows.push({
      id: phase.id,
      code: phaseCode,
      level: 2,
      responsibleSide: phase.initial_responsible_side,
      title: phase.title,
    });

    const children = (byParent[phase.id] || []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    let sectionIndex = 0;
    children.forEach((child) => {
      if (child.item_kind === 'section') {
        sectionIndex += 1;
        const sectionCode = `${phaseCode}.${sectionIndex}`;
        rows.push({
          id: child.id,
          code: sectionCode,
          level: 3,
          responsibleSide: child.initial_responsible_side,
          title: child.title,
        });

        const sectionChildren = (byParent[child.id] || []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        let taskIndex = 0;
        sectionChildren.forEach((t) => {
          if (t.item_kind !== 'task') return;
          taskIndex += 1;
          rows.push({
            id: t.id,
            code: `${sectionCode}.${taskIndex}`,
            level: 4,
            responsibleSide: t.initial_responsible_side,
            title: t.title,
          });
        });
      } else if (child.item_kind === 'task') {
        const existing = rows.filter((r) => r.level === 4 && r.code.startsWith(`${phaseCode}.`)).length;
        const taskIndex = existing + 1;
        rows.push({
          id: child.id,
          code: `${phaseCode}.${taskIndex}`,
          level: 4,
          responsibleSide: child.initial_responsible_side,
          title: child.title,
        });
      }
    });
  });

  return rows;
}

