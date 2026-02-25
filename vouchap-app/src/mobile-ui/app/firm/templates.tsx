/**
 * Firm - Service SKU: products linked to sku_items; creating an order copies items to projects.
 */
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { getCurrentSpace } from '@/lib/auth';
import { getFirmTemplates } from '@/lib/firm';
import type { FirmTemplate } from '@/types';

export default function FirmTemplatesScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<FirmTemplate[]>([]);

  useEffect(() => {
    (async () => {
      const space = await getCurrentSpace(true);
      if (!space?.id || space.kind !== 'firm') {
        router.replace('/');
        return;
      }
      const list = await getFirmTemplates(space.id);
      setTemplates(list);
      setLoading(false);
    })();
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Service SKU</Text>
      <Text style={styles.subtitle}>Products with checklist items; creating an order copies items to that order’s projects</Text>
      {loading ? (
        <ActivityIndicator size="large" color="#6C5CE7" style={styles.loader} />
      ) : templates.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No Service SKU yet. Add in Supabase firm.skus and firm.sku_items, or add an edit screen later.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {templates.map((t) => (
            <View key={t.id} style={styles.card}>
              <Text style={styles.cardTitle}>{t.name}</Text>
              {t.description ? <Text style={styles.cardDesc}>{t.description}</Text> : null}
              <Text style={styles.itemCount}>Items: {t.items?.length ?? 0}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#2D3436', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#636E72', marginBottom: 24 },
  loader: { marginTop: 40 },
  empty: { marginTop: 24 },
  emptyText: { fontSize: 14, color: '#95A5A6' },
  list: { gap: 12 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#2D3436' },
  cardDesc: { fontSize: 14, color: '#636E72', marginTop: 4 },
  itemCount: { fontSize: 12, color: '#95A5A6', marginTop: 8 },
});
