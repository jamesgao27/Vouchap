/**
 * Firm - Engagement 详情页（订单/委托详情）
 * 路由：/firm/engagement/[id]，待后续开发。
 */
import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function FirmEngagementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.placeholder}>Engagement detail</Text>
      <Text style={styles.id}>ID: {id ?? '—'}</Text>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => router.back()}
        activeOpacity={0.7}
      >
        <Ionicons name="arrow-back" size={20} color="#6C5CE7" />
        <Text style={styles.backBtnText}>Back to Engagements</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#F8F9FA', justifyContent: 'center', alignItems: 'center' },
  placeholder: { fontSize: 18, fontWeight: '600', color: '#2D3436', marginBottom: 8 },
  id: { fontSize: 14, color: '#636E72', marginBottom: 24 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16 },
  backBtnText: { fontSize: 16, color: '#6C5CE7', fontWeight: '500' },
});
