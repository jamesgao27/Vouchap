/**
 * Web 端报表/落地页占位：简单报表页，后续细化。
 */
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function WebReportView() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="stats-chart" size={32} color="#6C5CE7" />
        <Text style={styles.title}>Report</Text>
      </View>
      <Text style={styles.subtitle}>Overview and analytics (coming soon)</Text>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Charts and summary will appear here.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2D3436',
  },
  subtitle: {
    fontSize: 15,
    color: '#636E72',
    marginBottom: 24,
  },
  placeholder: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 48,
  },
  placeholderText: {
    fontSize: 15,
    color: '#95A5A6',
  },
});
