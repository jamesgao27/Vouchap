/**
 * CRM-Dashboard：Firm 空间专用，前端展示为「Dashboard」。
 * 隐藏普通 Dashboard / Income / Expenses / AI Inventory，仅展示 Firm 四个模块入口。
 */
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const FIRM_ITEMS = [
  { path: '/firm/clients', label: 'Client', icon: 'people-outline' as const },
  { path: '/firm/assignments', label: 'Assignment', icon: 'key-outline' as const },
  { path: '/firm/orders', label: 'Orders', icon: 'checkbox-outline' as const },
  { path: '/firm/templates', label: 'Service SKU', icon: 'document-attach-outline' as const },
];

export default function CrmDashboardView() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="grid-outline" size={28} color="#6C5CE7" />
        <Text style={styles.title}>Dashboard</Text>
      </View>
      <Text style={styles.subtitle}>CRM · Clients & tax filing</Text>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {FIRM_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.path}
              style={styles.card}
              onPress={() => router.push(item.path as any)}
              activeOpacity={0.7}
            >
              <Ionicons name={item.icon} size={28} color="#6C5CE7" style={styles.cardIcon} />
              <Text style={styles.cardLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={20} color="#95A5A6" />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
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
  subtitle: {
    fontSize: 14,
    color: '#636E72',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  grid: { gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  cardIcon: { marginRight: 14 },
  cardLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: '#2D3436' },
});
