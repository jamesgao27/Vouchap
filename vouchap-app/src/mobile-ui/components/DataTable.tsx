/**
 * Web 端通用数据表格：支持列显隐与列顺序（状态可扩展为持久化）。
 * 仅 Web 使用；移动端由各页 SectionList 展示。
 */
import React, { useState, useCallback, useMemo, useEffect, useRef, useLayoutEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createPortal } from 'react-dom';

export interface DataTableColumn<T> {
  id: string;
  label: string;
  getValue: (row: T) => React.ReactNode;
  /** 用于表头排序比较；不提供则该列不可排序 */
  getSortValue?: (row: T) => string | number | Date | null | undefined;
  visible?: boolean;
  minWidth?: number;
}

export interface DataTableSection<T> {
  title: string;
  data: T[];
  /** Same as mobile: count of items (e.g. confirmed) for section header */
  count?: number;
  /** Label after count, e.g. "receipts", "income", "inbounds", "outbounds" */
  countLabel?: string;
  /** Total amount for section (same currency as currency) */
  totalAmount?: number;
  /** Currency code for totalAmount display */
  currency?: string;
  /** Optional color for amount (e.g. income orange #D35400) */
  amountColor?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  /** 平铺数据（与 sections 二选一） */
  data?: T[];
  /** 分组数据（与 data 二选一）；传入时表体按分组渲染并显示分组标题行；排序时为组内排序 */
  sections?: DataTableSection<T>[];
  keyExtractor: (row: T) => string;
  onRowPress?: (row: T) => void;
  /** 当前排序列 id，与 sortDirection 一起由父组件根据 onSort 维护 */
  sortKey?: string | null;
  /** 当前排序方向：asc 正序（表头显示向下箭头），desc 倒序（向上箭头） */
  sortDirection?: 'asc' | 'desc';
  /** 点击表头时调用，父组件负责对 data/sections 排序后重新传入 */
  onSort?: (columnId: string, direction: 'asc' | 'desc') => void;
  storageKey?: string;
  emptyMessage?: string;
  /** 是否启用行多选（Web） */
  selectable?: boolean;
  /** 受控：选中行的 key 列表（不传则由内部管理） */
  selectedIds?: string[];
  /** 选中行变化时回调（与 selectedIds 搭配使用） */
  onSelectedIdsChange?: (ids: string[]) => void;
  /** 为 true 时：未选中任何行时多选列不常显，仅悬停行显示该行复选框；选中至少一行后整列显示 */
  selectableRevealOnHover?: boolean;
  /** 可选：按行返回额外 class（如置灰 data-table-row-muted） */
  getRowClassName?: (row: T) => string;
}

const TABLE_HEADER_BG = '#F1F3F5';
const TABLE_ROW_BG = '#FFFFFF';
const TABLE_ROW_HOVER_BG = '#F8F9FA';
const TABLE_BORDER = '#DEE2E6';
const TABLE_SECTION_BG = '#E9ECEF';
/** 与 UI 规范一致的无衬线字体，避免 table 默认衬线（如 Times） */
const TABLE_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Web 浮窗统一样式：列配置、分组、筛选三者一致 */
export const WEB_POPOVER = {
  container: {
    position: 'fixed' as const,
    zIndex: 99999,
    backgroundColor: '#FAFBFC',
    borderRadius: 12,
    border: '1px solid #E9ECEF',
    padding: '12px 14px',
    minWidth: 220,
    maxWidth: 280,
    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
    fontFamily: TABLE_FONT_FAMILY,
    fontSize: 13,
  },
  containerWide: { minWidth: 260, maxWidth: 320, maxHeight: '80vh' as const, overflow: 'auto' as const },
  title: { fontSize: 13, fontWeight: '600' as const, color: '#495057', marginBottom: 8 },
  /** Single-line list rows: firm clients / engagements Group & Filter popovers */
  optionRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingLeft: 12,
    paddingRight: 12,
    borderRadius: 8,
    minHeight: 40,
    boxSizing: 'border-box',
    cursor: 'pointer',
  },
  optionText: {
    fontSize: 13,
    lineHeight: '20px',
    color: '#2D3436',
    fontWeight: '500' as const,
    flex: 1,
    minWidth: 0,
  },
  optionTextSelected: { color: '#6C5CE7', fontWeight: '600' as const },
  optionBgSelected: 'rgba(108, 92, 231, 0.1)',
  hint: { fontSize: 12, color: '#95A5A6' },
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', CAD: 'C$', CNY: '¥', JPY: '¥', EUR: '€', GBP: '£', AUD: 'A$',
  HKD: 'HK$', TWD: 'NT$', KRW: '₩', SGD: 'S$', MXN: 'MX$', INR: '₹',
  THB: '฿', VND: '₫', PHP: '₱', MYR: 'RM', IDR: 'Rp',
};
function formatSectionAmount(amount: number, currency?: string): string {
  const symbol = CURRENCY_SYMBOLS[currency || 'USD'] || (currency ? `${currency} ` : '$');
  return `${symbol}${amount.toFixed(2)}`;
}

function TableGlobalStyles() {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const el = document.createElement('style');
    el.setAttribute('data-data-table', 'styles');
    el.textContent = [
      `.data-table-data-row { background-color: ${TABLE_ROW_BG} !important; }`,
      `.data-table-row-hover:hover { background-color: ${TABLE_ROW_HOVER_BG} !important; }`,
      `.data-table-row-muted { opacity: 0.6 !important; }`,
      `.data-table-section-header td { font-weight: 600; background-color: ${TABLE_SECTION_BG} !important; }`,
      `table.data-table-body, table.data-table-body th, table.data-table-body td { font-family: ${TABLE_FONT_FAMILY} !important; }`,
      'table.data-table-body { height: auto !important; }',
      'table.data-table-body thead tr { height: 44px !important; }',
      'table.data-table-body thead th { height: 44px !important; max-height: 44px !important; box-sizing: border-box !important; }',
      'table.data-table-body tbody tr { height: 40px !important; }',
      'table.data-table-body tbody td { height: 40px !important; max-height: 40px !important; box-sizing: border-box !important; overflow: hidden !important; vertical-align: middle !important; }',
      'table.data-table-body tbody td > div { max-height: 40px !important; min-height: 0 !important; overflow: hidden !important; }',
      '.data-table-checkbox-reveal-on-hover tbody tr td:first-child input[type=checkbox] { opacity: 0; transition: opacity 0.15s ease; }',
      '.data-table-checkbox-reveal-on-hover tbody tr:hover td:first-child input[type=checkbox] { opacity: 1; }',
    ].join('\n');
    document.head.appendChild(el);
    return () => {
      if (el.parentNode) el.parentNode.removeChild(el);
    };
  }, []);
  return null;
}

export default function DataTable<T>({
  columns,
  data: dataProp,
  sections: sectionsProp,
  keyExtractor,
  onRowPress,
  sortKey = null,
  sortDirection = 'asc',
  onSort,
  storageKey,
  emptyMessage = 'No data',
   selectable = false,
   selectedIds,
   onSelectedIdsChange,
   selectableRevealOnHover = false,
   getRowClassName,
}: DataTableProps<T>) {
  const hasSections = sectionsProp != null && sectionsProp.length > 0;
  const data = hasSections ? sectionsProp!.flatMap(s => s.data) : (dataProp ?? []);
  const sections = hasSections ? sectionsProp! : null;
  const defaultVisibleIds = useMemo(() => columns.filter(c => c.visible !== false).map(c => c.id), [columns]);
  const defaultOrderIds = useMemo(() => columns.map(c => c.id), [columns]);

  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set(defaultVisibleIds));
  const [orderIds, setOrderIds] = useState<string[]>(() => defaultOrderIds);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<number>>(new Set());
  const [dropdownRect, setDropdownRect] = useState<{ left: number; top: number } | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const pickerWrapRef = useRef<View | null>(null);
  const columnResizingRef = useRef(false);

  // 多选：内部维护选中行，若父组件提供受控 selectedIds 则以外部为准
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
  const selectedSet = useMemo(() => {
    if (Array.isArray(selectedIds)) return new Set(selectedIds);
    return internalSelected;
  }, [selectedIds, internalSelected]);

  const setSelected = useCallback(
    (ids: string[]) => {
      if (onSelectedIdsChange) {
        onSelectedIdsChange(ids);
      } else {
        setInternalSelected(new Set(ids));
      }
    },
    [onSelectedIdsChange]
  );

  const toggleSection = useCallback((sectionIdx: number) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionIdx)) next.delete(sectionIdx);
      else next.add(sectionIdx);
      return next;
    });
  }, []);

  const idToColumn = useMemo(() => {
    const m = new Map<string, DataTableColumn<T>>();
    columns.forEach(c => m.set(c.id, c));
    return m;
  }, [columns]);

  const orderedVisibleColumns = useMemo(() => {
    const result: DataTableColumn<T>[] = [];
    orderIds.forEach(id => {
      if (visibleIds.has(id)) {
        const col = idToColumn.get(id);
        if (col) result.push(col);
      }
    });
    return result;
  }, [orderIds, visibleIds, idToColumn]);

  const toggleColumn = useCallback((id: string) => {
    setVisibleIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const moveColumn = useCallback((id: string, direction: 'left' | 'right') => {
    setOrderIds(prev => {
      const i = prev.indexOf(id);
      if (i === -1) return prev;
      const j = direction === 'left' ? i - 1 : i + 1;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  const reorderColumns = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setOrderIds(prev => {
      const arr = [...prev];
      const [removed] = arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, removed);
      return arr;
    });
  }, []);

  const displayOrder = useMemo(() => {
    if (draggedIndex == null || dropTargetIndex == null || draggedIndex === dropTargetIndex) return orderIds;
    const arr = orderIds.filter((_, i) => i !== draggedIndex);
    arr.splice(dropTargetIndex, 0, orderIds[draggedIndex]);
    return arr;
  }, [orderIds, draggedIndex, dropTargetIndex]);

  // 计算「全选」状态（所有行都被选中）
  const allSelectableKeys = useMemo(() => data.map(row => keyExtractor(row)), [data, keyExtractor]);
  const allSelected = useMemo(
    () => selectable && allSelectableKeys.length > 0 && allSelectableKeys.every(k => selectedSet.has(k)),
    [selectable, allSelectableKeys, selectedSet]
  );

  useLayoutEffect(() => {
    if (Platform.OS !== 'web' || !showColumnPicker) {
      setDropdownRect(null);
      return;
    }
    const measure = () => {
      const el = (pickerWrapRef.current as unknown as HTMLElement | null) ?? document.getElementById('data-table-column-picker-wrap');
      if (el?.getBoundingClientRect) {
        const r = el.getBoundingClientRect();
        setDropdownRect({ left: r.left, top: r.bottom + 6 });
      } else {
        setDropdownRect(null);
      }
    };
    measure();
    const t = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(t);
  }, [showColumnPicker]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !showColumnPicker) return;
    const handler = (e: PointerEvent) => {
      const wrap = document.getElementById('data-table-column-picker-wrap');
      const dropdown = document.getElementById('data-table-column-picker-dropdown');
      const target = e.target as Node;
      if (wrap && !wrap.contains(target) && dropdown && !dropdown.contains(target)) setShowColumnPicker(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [showColumnPicker]);

  // 在 Web 平台上注入 CSS 样式以确保表头 sticky 生效
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    
    const styleId = 'data-table-sticky-header-style';
    // 移除旧的样式（如果存在）
    const existingStyle = document.getElementById(styleId);
    if (existingStyle) {
      existingStyle.remove();
    }
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      /* 针对 React Native Web ScrollView 的滚动容器 */
      div[data-rn-scrollview] {
        overflow-y: auto !important;
      }
      /* 确保表格容器支持 sticky */
      .data-table-body {
        border-collapse: collapse;
      }
      /* 表头 sticky 样式 */
      .data-table-body thead {
        position: sticky !important;
        top: 0 !important;
        z-index: 10 !important;
        background-color: ${TABLE_HEADER_BG} !important;
      }
      .data-table-body thead th {
        position: sticky !important;
        top: 0 !important;
        z-index: 10 !important;
        background-color: ${TABLE_HEADER_BG} !important;
      }
      /* 针对可能的嵌套滚动容器 */
      [class*="ScrollView"] thead,
      [data-rn-scrollview] thead {
        position: sticky !important;
        top: 0 !important;
        z-index: 10 !important;
        background-color: ${TABLE_HEADER_BG} !important;
      }
      [class*="ScrollView"] thead th,
      [data-rn-scrollview] thead th {
        position: sticky !important;
        top: 0 !important;
        z-index: 10 !important;
        background-color: ${TABLE_HEADER_BG} !important;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      const styleToRemove = document.getElementById(styleId);
      if (styleToRemove) {
        styleToRemove.remove();
      }
    };
  }, []);

  // 使用 useLayoutEffect 实现表头固定（使用 transform 方案）
  useLayoutEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    
    let cleanup: (() => void) | null = null;
    
    const applyFixedHeader = () => {
      // 清理之前的监听器
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
      
      const table = document.querySelector('.data-table-body, #data-table-body') as HTMLTableElement;
      if (!table) return;
      
      // 找到包含表格的滚动容器
      let scrollContainer: HTMLElement | null = table.parentElement;
      while (scrollContainer && scrollContainer !== document.body) {
        const computedStyle = window.getComputedStyle(scrollContainer);
        const hasOverflow = computedStyle.overflowY === 'auto' || 
                           computedStyle.overflowY === 'scroll' ||
                           computedStyle.overflow === 'auto' ||
                           computedStyle.overflow === 'scroll';
        const hasScroll = scrollContainer.scrollHeight > scrollContainer.clientHeight;
        
        if (hasOverflow || hasScroll) {
          break;
        }
        scrollContainer = scrollContainer.parentElement;
      }
      
      // 如果没找到滚动容器，尝试查找 React Native Web ScrollView
      let finalScrollContainer: HTMLElement | Window = window;
      if (scrollContainer && scrollContainer !== document.body) {
        finalScrollContainer = scrollContainer;
      } else {
        const rnScrollView = document.querySelector('[data-rn-scrollview]') as HTMLElement ||
                            document.querySelector('[class*="ScrollView"]') as HTMLElement;
        if (rnScrollView) {
          finalScrollContainer = rnScrollView;
        }
      }
      
      const thead = table.querySelector('thead, #data-table-thead') as HTMLElement;
      if (!thead) return;
      
      let lastOffsetTop = -1;
      const updateHeaderPosition = () => {
        const tableRect = table.getBoundingClientRect();
        const scrollContainerRect = finalScrollContainer === window ? 
          { top: 0, bottom: window.innerHeight } : 
          (finalScrollContainer as HTMLElement).getBoundingClientRect();
        
        // 检查表格是否在视口中
        if (tableRect.bottom < scrollContainerRect.top || tableRect.top > scrollContainerRect.bottom) {
          // 表格不在视口中，恢复正常位置
          if (lastOffsetTop !== -1) {
            thead.style.transform = '';
            thead.style.position = '';
            lastOffsetTop = -1;
          }
          return;
        }
        
        // 如果表格顶部在滚动容器顶部之上，固定表头
        if (tableRect.top < scrollContainerRect.top) {
          const offsetTop = scrollContainerRect.top - tableRect.top;
          
          // 只在 offsetTop 变化时更新，减少抖动
          if (Math.abs(lastOffsetTop - offsetTop) > 0.5) {
            // 使用 transform 来定位，避免影响布局
            thead.style.position = 'relative';
            thead.style.transform = `translateY(${offsetTop}px)`;
            thead.style.zIndex = '10';
            thead.style.backgroundColor = TABLE_HEADER_BG;
            
            // 为表头单元格也设置样式
            const thElements = thead.querySelectorAll('th');
            thElements.forEach((th) => {
              const thEl = th as HTMLElement;
              thEl.style.backgroundColor = TABLE_HEADER_BG;
            });
            
            lastOffsetTop = offsetTop;
          }
        } else {
          // 表格顶部在滚动容器顶部之下，恢复正常位置
          if (lastOffsetTop !== -1) {
            thead.style.transform = '';
            thead.style.position = '';
            lastOffsetTop = -1;
          }
        }
      };
      
      // 初始更新
      updateHeaderPosition();
      
      // 监听滚动事件
      const handleScroll = () => {
        requestAnimationFrame(updateHeaderPosition);
      };
      
      const isWindow = finalScrollContainer === window;
      if (isWindow) {
        window.addEventListener('scroll', handleScroll, true);
        window.addEventListener('resize', updateHeaderPosition);
        cleanup = () => {
          window.removeEventListener('scroll', handleScroll, true);
          window.removeEventListener('resize', updateHeaderPosition);
        };
      } else {
        const container = finalScrollContainer as HTMLElement;
        container.addEventListener('scroll', handleScroll, true);
        window.addEventListener('scroll', handleScroll, true);
        window.addEventListener('resize', updateHeaderPosition);
        cleanup = () => {
          container.removeEventListener('scroll', handleScroll, true);
          window.removeEventListener('scroll', handleScroll, true);
          window.removeEventListener('resize', updateHeaderPosition);
        };
      }
    };
    
    // 延迟执行以确保 DOM 已完全渲染
    const timeoutId = setTimeout(() => {
      applyFixedHeader();
    }, 300);
    
    // 使用 MutationObserver 监听 DOM 变化
    const observer = new MutationObserver(() => {
      setTimeout(applyFixedHeader, 100);
    });
    
    observer.observe(document.body, { childList: true, subtree: true });
    
    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
      if (cleanup) {
        cleanup();
      }
    };
  }, [data, sections]);

  if (Platform.OS !== 'web') return null;

  const tableStyle = {
    width: '100%' as const,
    minWidth: '100%' as const,
    borderCollapse: 'collapse' as const,
    fontFamily: TABLE_FONT_FAMILY,
    fontSize: 14,
    color: '#2D3436',
  };
  const thStyle = {
    padding: '10px 14px',
    textAlign: 'left' as const,
    fontFamily: TABLE_FONT_FAMILY,
    fontSize: 13,
    fontWeight: 600,
    color: '#495057',
    letterSpacing: 0.2,
    backgroundColor: TABLE_HEADER_BG,
    borderBottom: `2px solid ${TABLE_BORDER}`,
    whiteSpace: 'nowrap' as const,
    height: '44px' as const,
    maxHeight: '44px' as const,
    boxSizing: 'border-box' as const,
    position: 'sticky' as const,
    top: 0,
    zIndex: 10,
  };
  const tdStyle = {
    padding: '8px 14px',
    borderBottom: `1px solid ${TABLE_BORDER}`,
    fontFamily: TABLE_FONT_FAMILY,
    fontSize: 14,
    lineHeight: '20px' as const,
    height: '40px' as const,
    maxHeight: '40px' as const,
    verticalAlign: 'middle' as const,
    boxSizing: 'border-box' as const,
    overflow: 'hidden' as const,
  };
  const sectionHeaderStyle = {
    padding: '6px 14px',
    fontFamily: TABLE_FONT_FAMILY,
    fontSize: 13,
    fontWeight: 600,
    color: '#495057',
    backgroundColor: TABLE_SECTION_BG,
    borderBottom: `1px solid ${TABLE_BORDER}`,
    height: '36px' as const,
    boxSizing: 'border-box' as const,
    cursor: 'pointer' as const,
  };

  return (
    <View style={styles.wrapper} nativeID="data-table-wrapper">
      <ScrollView 
        horizontal 
        style={styles.scroll} 
        contentContainerStyle={styles.scrollContent}
        nativeID="data-table-scroll-container"
      >
        <table
          style={tableStyle}
          className={'data-table-body' + (selectable && selectableRevealOnHover && selectedSet.size === 0 ? ' data-table-checkbox-reveal-on-hover' : '')}
          id="data-table-body"
        >
          <thead
            style={{
              position: 'sticky' as const,
              top: 0,
              zIndex: 10,
              backgroundColor: TABLE_HEADER_BG,
            }}
            id="data-table-thead"
          >
            <tr>
              <th style={{ ...thStyle, width: 40, minWidth: 40, padding: '8px' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
                  {selectable && (
                    <View
                      style={{
                        width: 20,
                        height: 16,
                        marginRight: 4,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {(!selectableRevealOnHover || selectedSet.size > 0) && (
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={(e) => {
                            e.stopPropagation();
                            if (!selectable) return;
                            if (allSelected) {
                              setSelected([]);
                            } else {
                              setSelected(allSelectableKeys);
                            }
                          }}
                          style={{ cursor: 'pointer', width: 16, height: 16 }}
                        />
                      )}
                    </View>
                  )}
                  <View
                    ref={pickerWrapRef}
                    style={styles.columnPickerWrap}
                    nativeID="data-table-column-picker-wrap"
                  >
                    <TouchableOpacity
                      onPress={() => setShowColumnPicker(v => !v)}
                      style={styles.columnPickerBtn}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="options-outline" size={18} color="#636E72" />
                    </TouchableOpacity>
                    {showColumnPicker && dropdownRect && typeof document !== 'undefined' && document.body &&
                      createPortal(
                        <div
                          id="data-table-column-picker-dropdown"
                          style={{
                            ...WEB_POPOVER.container,
                            left: dropdownRect.left,
                            top: dropdownRect.top,
                          }}
                        >
                          <View style={styles.columnPickerHeader}>
                            <Text style={[WEB_POPOVER.title, { marginBottom: 4, lineHeight: 20 }]}>Columns</Text>
                            <Text style={[WEB_POPOVER.hint, { lineHeight: 18 }]}>Drag to reorder. Toggle to show/hide.</Text>
                          </View>
                          <ScrollView style={styles.columnPickerScroll}>
                            {displayOrder.map((id, idx) => {
                              const col = idToColumn.get(id);
                              if (!col) return null;
                              const isVisible = visibleIds.has(id);
                              const originalIndex = orderIds.indexOf(id);
                              const isDragging = draggedIndex !== null && orderIds[draggedIndex] === id;
                              const rowContent = (
                                <View style={styles.columnPickerCheckRow}>
                                  <View style={styles.columnPickerDragHandle}>
                                    <Ionicons name="reorder-three" size={16} color="#95A5A6" />
                                  </View>
                                  <TouchableOpacity
                                    onPress={() => toggleColumn(id)}
                                    style={styles.columnPickerCheckRow}
                                    activeOpacity={0.7}
                                  >
                                    <View style={[styles.columnPickerCheck, isVisible && styles.columnPickerCheckOn]}>
                                      {isVisible && <Ionicons name="checkmark" size={14} color="#fff" />}
                                    </View>
                                    <Text style={styles.columnPickerLabel}>{col.label}</Text>
                                  </TouchableOpacity>
                                </View>
                              );
                              return Platform.OS === 'web' ? (
                                <div
                                  key={id}
                                  draggable
                                  data-drop-index={idx}
                                  onDragStart={(e: React.DragEvent) => {
                                    setDraggedIndex(originalIndex);
                                    setDropTargetIndex(null);
                                    if (e.dataTransfer) {
                                      e.dataTransfer.effectAllowed = 'move';
                                      e.dataTransfer.setData('text/plain', id);
                                    }
                                  }}
                                  onDragOver={(e: React.DragEvent) => {
                                    e.preventDefault();
                                    e.dataTransfer && (e.dataTransfer.dropEffect = 'move');
                                    setDropTargetIndex(idx);
                                  }}
                                  onDrop={(e: React.DragEvent) => {
                                    e.preventDefault();
                                    const toIndex = parseInt(
                                      (e.currentTarget?.getAttribute?.('data-drop-index') ?? '') || '-1',
                                      10
                                    );
                                    if (draggedIndex != null && toIndex >= 0 && draggedIndex !== toIndex) {
                                      reorderColumns(draggedIndex, toIndex);
                                    }
                                    setDraggedIndex(null);
                                    setDropTargetIndex(null);
                                  }}
                                  onDragEnd={() => {
                                    setDraggedIndex(null);
                                    setDropTargetIndex(null);
                                  }}
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    paddingTop: 10,
                                    paddingBottom: 10,
                                    paddingLeft: 12,
                                    paddingRight: 12,
                                    opacity: isDragging ? 0.6 : 1,
                                    cursor: 'grab',
                                    backgroundColor: dropTargetIndex === idx ? WEB_POPOVER.optionBgSelected : 'transparent',
                                    borderRadius: 8,
                                  }}
                                >
                                  {rowContent}
                                </div>
                              ) : (
                                <View key={id} style={[styles.columnPickerRow, isDragging && styles.columnPickerRowDragging]}>
                                  {rowContent}
                                </View>
                              );
                            })}
                          </ScrollView>
                        </div>,
                        document.body
                      )}
                  </View>
                </View>
              </th>
              {orderedVisibleColumns.map((col, colIdx) => {
                const isSortable = !!onSort && !!col.getSortValue;
                const isActive = sortKey === col.id;
                const nextDir = isActive && sortDirection === 'asc' ? 'desc' : 'asc';
                return (
                  <th
                    key={col.id}
                    data-column-id={col.id}
                    style={{
                      ...thStyle,
                      minWidth: col.minWidth ?? 90,
                      cursor: isSortable ? 'pointer' : 'default',
                      userSelect: 'none',
                      position: 'relative' as const,
                    }}
                    onClick={isSortable ? () => {
                      if (columnResizingRef.current) {
                        columnResizingRef.current = false;
                        return;
                      }
                      onSort(col.id, nextDir);
                    } : undefined}
                    role={isSortable ? 'button' : undefined}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ flexShrink: 0 }} numberOfLines={1}>{col.label}</Text>
                      {isSortable && isActive && (
                        <View style={{ flexShrink: 0 }}>
                          {sortDirection === 'desc' ? (
                            <Ionicons name="chevron-up" size={16} color="#6C5CE7" />
                          ) : (
                            <Ionicons name="chevron-down" size={16} color="#6C5CE7" />
                          )}
                        </View>
                      )}
                    </View>
                    {Platform.OS === 'web' && (
                      <div
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: 0,
                          bottom: 0,
                          width: 4,
                          cursor: 'col-resize',
                          backgroundColor: 'rgba(222, 226, 230, 0.3)',
                          borderRight: '1px solid rgba(173, 181, 189, 0.5)',
                          transition: 'background-color 0.15s ease',
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                        }}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          columnResizingRef.current = true;
                          const th = e.currentTarget.parentElement as HTMLElement;
                          if (!th) return;
                          const startX = e.clientX;
                          const startWidth = th.offsetWidth;
                          const minW = col.minWidth ?? 90;
                          const handleMouseMove = (moveE: MouseEvent) => {
                            const diff = moveE.clientX - startX;
                            const newWidth = Math.max(minW, startWidth + diff);
                            th.style.width = `${newWidth}px`;
                            th.style.minWidth = `${newWidth}px`;
                            const table = th.closest('table');
                            if (table) {
                              const tds = table.querySelectorAll(`td:nth-child(${colIdx + 2})`);
                              tds.forEach((td: any) => {
                                if (td) {
                                  td.style.width = `${newWidth}px`;
                                  td.style.minWidth = `${newWidth}px`;
                                }
                              });
                            }
                          };
                          const handleMouseUp = () => {
                            document.removeEventListener('mousemove', handleMouseMove);
                            document.removeEventListener('mouseup', handleMouseUp);
                            document.body.style.cursor = '';
                            document.body.style.userSelect = '';
                            setTimeout(() => { columnResizingRef.current = false; }, 0);
                          };
                          document.addEventListener('mousemove', handleMouseMove);
                          document.addEventListener('mouseup', handleMouseUp);
                          document.body.style.cursor = 'col-resize';
                          document.body.style.userSelect = 'none';
                        }}
                        onMouseEnter={(e) => {
                          if (Platform.OS === 'web') {
                            const el = e.currentTarget as HTMLElement;
                            el.style.backgroundColor = 'rgba(108, 92, 231, 0.15)';
                            el.style.borderRight = '1px solid rgba(108, 92, 231, 0.4)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (Platform.OS === 'web') {
                            const el = e.currentTarget as HTMLElement;
                            el.style.backgroundColor = 'rgba(222, 226, 230, 0.3)';
                            el.style.borderRight = '1px solid rgba(173, 181, 189, 0.5)';
                          }
                        }}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={orderedVisibleColumns.length + 1} style={{ ...tdStyle, textAlign: 'center', color: '#95A5A6', paddingTop: 32, paddingBottom: 32 }}>
                  {emptyMessage}
                </td>
              </tr>
            ) : sections ? (
              sections.map((section, sectionIdx) => {
                const isCollapsed = collapsedSections.has(sectionIdx);
                const sectionRowKeys = section.data.map(row => keyExtractor(row));
                const sectionAllSelected = selectable && sectionRowKeys.length > 0 && sectionRowKeys.every(k => selectedSet.has(k));
                return (
                  <React.Fragment key={`section-${sectionIdx}`}>
                    <tr
                      className="data-table-section-header"
                      onClick={() => toggleSection(sectionIdx)}
                      style={{ cursor: 'pointer' } as any}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e: any) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSection(sectionIdx); } }}
                    >
                      <td style={{ ...tdStyle, width: 40, minWidth: 40, padding: '0 8px' }}>
                        {selectable && (
                          <input
                            type="checkbox"
                            checked={sectionAllSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              const next = new Set(selectedSet);
                              if (sectionAllSelected) {
                                sectionRowKeys.forEach(k => next.delete(k));
                              } else {
                                sectionRowKeys.forEach(k => next.add(k));
                              }
                              setSelected(Array.from(next));
                            }}
                            onClick={(e) => e.stopPropagation()}
                            style={{ cursor: 'pointer', width: 16, height: 16 }}
                          />
                        )}
                      </td>
                      <td colSpan={orderedVisibleColumns.length} style={sectionHeaderStyle}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                          <Ionicons name={isCollapsed ? 'chevron-forward' : 'chevron-down'} size={18} color="#636E72" />
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#495057', marginRight: 8 }}>{section.title}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginLeft: 4 }}>
                            {section.count != null && section.countLabel != null && (
                              <Text style={{ fontSize: 13, color: '#636E72' }}>{section.count} {section.countLabel}</Text>
                            )}
                            {section.totalAmount != null && section.totalAmount > 0 && section.currency != null && (
                              <Text style={{ fontSize: 13, fontWeight: '600', color: section.amountColor ?? '#2D3436' }}>
                                {formatSectionAmount(section.totalAmount, section.currency)}
                              </Text>
                            )}
                          </View>
                        </View>
                      </td>
                    </tr>
                    {!isCollapsed && section.data.map(row => {
                      const key = keyExtractor(row);
                      return (
                        <tr
                          key={key}
                          onClick={() => onRowPress?.(row)}
                          style={{
                            cursor: onRowPress ? 'pointer' : 'default',
                            backgroundColor: TABLE_ROW_BG,
                            height: '40px',
                          } as any}
                          className={`data-table-data-row ${onRowPress ? 'data-table-row-hover' : ''} ${getRowClassName?.(row) ?? ''}`.trim()}
                        >
                          <td style={{ ...tdStyle, width: 40, minWidth: 40, padding: '0 8px' }}>
                            {selectable && (
                              <input
                                type="checkbox"
                                checked={selectedSet.has(key)}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  const next = new Set(selectedSet);
                                  if (next.has(key)) next.delete(key);
                                  else next.add(key);
                                  setSelected(Array.from(next));
                                }}
                                onClick={(e) => e.stopPropagation()}
                                style={{ cursor: 'pointer', width: 16, height: 16 }}
                              />
                            )}
                          </td>
                          {orderedVisibleColumns.map(col => (
                            <td key={col.id} style={tdStyle}>
                              {col.getValue(row)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })
            ) : (
              data.map(row => {
                const key = keyExtractor(row);
                return (
                  <tr
                    key={key}
                    onClick={() => onRowPress?.(row)}
                    style={{
                      cursor: onRowPress ? 'pointer' : 'default',
                      backgroundColor: TABLE_ROW_BG,
                      height: '40px',
                    } as any}
                    className={`data-table-data-row ${onRowPress ? 'data-table-row-hover' : ''} ${getRowClassName?.(row) ?? ''}`.trim()}
                  >
                    <td style={{ ...tdStyle, width: 40, minWidth: 40, padding: '0 8px' }}>
                      {selectable && (
                        <input
                          type="checkbox"
                          checked={selectedSet.has(key)}
                          onChange={(e) => {
                            e.stopPropagation();
                            const next = new Set(selectedSet);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            setSelected(Array.from(next));
                          }}
                          onClick={(e) => e.stopPropagation()}
                          style={{ cursor: 'pointer', width: 16, height: 16 }}
                        />
                      )}
                    </td>
                    {orderedVisibleColumns.map(col => (
                      <td key={col.id} style={tdStyle}>
                        {col.getValue(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </ScrollView>
      {/* Web 悬停行背景：注入全局样式 */}
      {Platform.OS === 'web' && <TableGlobalStyles />}
    </View>
  );
}

const styles = StyleSheet.create({
  /* 不占满视口、不参与 flex 拉伸，仅包住表格内容高度 */
  wrapper: { 
    width: '100%', 
    alignSelf: 'flex-start', 
    flexGrow: 0, 
    flexShrink: 0, 
    minHeight: 120,
    ...(Platform.OS === 'web' ? { overflow: 'visible' as const } : {}),
  },
  scroll: { alignSelf: 'flex-start', width: '100%', flexGrow: 0 },
  scrollContent: { minWidth: '100%', flexGrow: 0, alignSelf: 'flex-start' },
  columnPickerWrap: { position: 'relative' as const },
  columnPickerBtn: { padding: 4 },
  columnPickerDropdown: {
    position: 'absolute' as const,
    top: '100%',
    left: 0,
    marginTop: 6,
    backgroundColor: '#FAFBFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    paddingVertical: 12,
    paddingHorizontal: 14,
    minWidth: 220,
    maxWidth: 280,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 12,
  },
  columnPickerDropdownPortal: {
    position: 'absolute' as const,
    zIndex: 99999,
    backgroundColor: '#FAFBFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    paddingVertical: 12,
    paddingHorizontal: 14,
    minWidth: 220,
    maxWidth: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 12,
  },
  columnPickerHeader: { marginBottom: 4 },
  columnPickerTitle: { fontSize: 13, fontWeight: '600', color: '#495057', marginBottom: 4, letterSpacing: 0.2 },
  columnPickerHint: { fontSize: 12, color: '#95A5A6' },
  columnPickerScroll: { maxHeight: 320 },
  columnPickerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, minHeight: 40 },
  columnPickerRowDragging: { opacity: 0.6 },
  columnPickerCheckRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  columnPickerDragHandle: { marginRight: 6 },
  columnPickerCheck: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#BDC3C7',
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  columnPickerCheckOn: { backgroundColor: '#6C5CE7', borderColor: '#6C5CE7' },
  columnPickerLabel: { fontSize: 13, color: '#2D3436', fontWeight: '500' },
  columnPickerOrder: { flexDirection: 'row' },
  columnPickerOrderBtn: { padding: 4 },
  columnPickerOrderBtnDisabled: { opacity: 0.5 },
});
