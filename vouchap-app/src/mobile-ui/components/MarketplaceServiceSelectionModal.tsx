/**
 * Client Service Marketplace — step 1: confirm choice of published template (firm + service highlighted).
 */
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const NEXT_STEPS_FONT_SIZE = 13;

const NEXT_STEP_LINES = [
  'You will start a service order for this offering.',
  'Your firm will contact you about next steps for this engagement.',
  'Please watch your inbox for related email from your firm.',
] as const;

type Props = {
  visible: boolean;
  firmName: string;
  templateName: string;
  onCancel: () => void;
  onContinue: () => void;
};

export default function MarketplaceServiceSelectionModal({
  visible,
  firmName,
  templateName,
  onCancel,
  onContinue,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const useGoldenButtonRatio = windowWidth >= 420;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Dismiss" />
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Confirm your selection</Text>
            <TouchableOpacity onPress={onCancel} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color="#636E72" />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <View style={styles.highlightBlock}>
              <Text style={styles.metaLabel}>Firm</Text>
              <Text style={styles.firmName}>{firmName.trim() || '—'}</Text>
              <Text style={[styles.metaLabel, styles.metaLabelSecond]}>Service</Text>
              <Text style={styles.templateName}>{templateName.trim() || '—'}</Text>
            </View>

            <View style={styles.nextStepsBlock}>
              {NEXT_STEP_LINES.map((line, index) => (
                <View key={line} style={styles.nextStepRow}>
                  <View style={styles.stepBulletCol}>
                    <Text style={styles.stepBulletMark} accessibilityLabel={`Step ${index + 1}`}>
                      📌
                    </Text>
                  </View>
                  <View style={styles.stepTextCol}>
                    <Text style={styles.nextStepsLine}>{line}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.footerActions}>
            <TouchableOpacity
              style={[styles.cancelBtn, useGoldenButtonRatio && styles.cancelBtnGolden]}
              onPress={onCancel}
              activeOpacity={0.85}
            >
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.continueBtn, useGoldenButtonRatio && styles.continueBtnGolden]}
              onPress={onContinue}
              activeOpacity={0.85}
            >
              <Text style={styles.continueBtnText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F4',
  },
  title: {
    flex: 1,
    marginRight: 10,
    fontSize: 17,
    fontWeight: '700',
    color: '#2D3436',
  },
  body: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },
  highlightBlock: {
    alignSelf: 'stretch',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#95A5A6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaLabelSecond: {
    marginTop: 12,
  },
  firmName: {
    alignSelf: 'stretch',
    marginTop: 4,
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3436',
    lineHeight: 24,
  },
  templateName: {
    alignSelf: 'stretch',
    marginTop: 4,
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3436',
    lineHeight: 22,
  },
  nextStepsBlock: {
    alignSelf: 'stretch',
    gap: 8,
  },
  nextStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    width: '100%',
  },
  stepBulletCol: {
    flexShrink: 0,
    paddingTop: 1,
    paddingRight: 6,
  },
  stepBulletMark: {
    fontSize: NEXT_STEPS_FONT_SIZE,
    lineHeight: 19,
  },
  stepTextCol: {
    flex: 1,
    minWidth: 0,
  },
  nextStepsLine: {
    alignSelf: 'stretch',
    width: '100%',
    fontSize: NEXT_STEPS_FONT_SIZE,
    color: '#636E72',
    lineHeight: 19,
  },
  footerActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexWrap: 'nowrap',
  },
  cancelBtn: {
    minWidth: 96,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#DDE1E6',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: '#636E72' },
  continueBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#6C5CE7',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  continueBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  cancelBtnGolden: { flex: 0.382, minWidth: 0 },
  continueBtnGolden: { flex: 0.618, minWidth: 0 },
});
