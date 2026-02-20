import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { subscribeToast, type ToastPayload } from '@/lib/toast';

export function ToastHost() {
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const unsubscribe = subscribeToast((payload) => {
      setToast(payload);
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.delay(payload.duration),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setToast(null);
      });
    });
    return unsubscribe;
  }, [opacity]);

  if (!toast) return null;

  // 规范：success/info 用中性灰（与录音「时长过短」等提示一致），error 用红色
  const backgroundColor =
    toast.type === 'error' ? '#e74c3c' : '#2d3436';

  return (
    <View pointerEvents="none" style={styles.container}>
      <Animated.View style={[styles.toast, { opacity, backgroundColor }]}>
        <Text style={styles.text}>{toast.message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Platform.OS === 'ios' ? 80 : 60,
    alignItems: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  toast: {
    maxWidth: '90%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  text: {
    color: '#fff',
    fontSize: 14,
  },
});

