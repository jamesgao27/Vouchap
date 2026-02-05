import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

/**
 * AI 进销存 - 入口 Hub
 * 采购端：receipts（收据）、inbound（入库单）
 * 销售端：invoices（发票）、outbound（出库单）
 * 商品：skus（标准 SKU 管理）
 */
export default function AIInventoryScreen() {
  const router = useRouter();

  const sections = [
    {
      title: '采购端',
      items: [
        { label: '收据 Receipts', route: '/receipts', icon: 'receipt-outline' as const },
        { label: '入库单 Inbound', route: '/inbound', icon: 'arrow-down-circle-outline' as const },
      ],
    },
    {
      title: '销售端',
      items: [
        { label: '发票 Invoices', route: '/invoices', icon: 'document-text-outline' as const },
        { label: '出库单 Outbound', route: '/outbound', icon: 'arrow-up-circle-outline' as const },
      ],
    },
    {
      title: '基础数据',
      items: [
        { label: '商品 SKU 管理', route: '/skus-manage', icon: 'cube-outline' as const },
      ],
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>AI 进销存</Text>
      <Text style={styles.subtitle}>采购 · 销售 · 库存</Text>
      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {section.items.map((item) => (
            <TouchableOpacity
              key={item.route}
              style={styles.card}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.7}
            >
              <Ionicons name={item.icon} size={24} color="#6C5CE7" style={styles.cardIcon} />
              <Text style={styles.cardLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={20} color="#95A5A6" />
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#2D3436', marginBottom: 4, textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#636E72', marginBottom: 24, textAlign: 'center' },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#95A5A6', marginBottom: 12, marginLeft: 4 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  cardIcon: { marginRight: 12 },
  cardLabel: { flex: 1, fontSize: 16, fontWeight: '500', color: '#2D3436' },
});
