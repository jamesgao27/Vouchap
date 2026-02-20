import React from 'react';
import { View, Text, ViewStyle, TextStyle, LayoutChangeEvent, Platform } from 'react-native';

// MaskedView 内部使用 requireNativeComponent，Web 上不可用，仅在原生端动态导入
let MaskedView: React.ComponentType<any> | null = null;
let LinearGradient: React.ComponentType<any> | null = null;
if (Platform.OS !== 'web') {
  MaskedView = require('@react-native-community/masked-view').default;
  LinearGradient = require('expo-linear-gradient').LinearGradient;
}

interface GradientTextProps {
  text: string;
  style?: TextStyle;
  containerStyle?: ViewStyle;
  colors?: string[];
}

export const GradientText: React.FC<GradientTextProps> = ({
  text,
  style,
  containerStyle,
  colors = ['#0066FF', '#8B00FF', '#FF1493'],
}) => {
  const [dimensions, setDimensions] = React.useState({ width: 0, height: 0 });

  const parts = text.split(',');
  const lines: string[] = [];
  parts.forEach((part, index) => {
    if (index === 0) {
      lines.push(part.trim() + ',');
    } else {
      lines.push(part.trim());
    }
  });

  const isAndroid = Platform.OS === 'android';
  const isWeb = Platform.OS === 'web';
  const solidColor = colors[0] || '#6C5CE7';

  const textStyle: TextStyle = {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    ...style,
    ...((isAndroid || isWeb) && { color: solidColor }),
  };

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0 && (dimensions.width !== width || dimensions.height !== height)) {
      setDimensions({ width, height });
    }
  };

  // Web / Android：单色文字，不依赖 MaskedView
  if (isWeb || isAndroid) {
    return (
      <View style={[{ alignItems: 'center', justifyContent: 'center' }, containerStyle]}>
        <Text style={textStyle}>{lines.join('\n')}</Text>
      </View>
    );
  }

  // iOS：渐变效果（MaskedView + LinearGradient 已在上方按需 require）
  return (
    <View style={[{ alignItems: 'center', justifyContent: 'center' }, containerStyle]}>
      {dimensions.width > 0 && dimensions.height > 0 && MaskedView && LinearGradient ? (
        <MaskedView
          style={{ width: dimensions.width, height: dimensions.height, alignItems: 'center', justifyContent: 'center' }}
          maskElement={
            <View style={{ width: dimensions.width, height: dimensions.height, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={textStyle}>{lines.join('\n')}</Text>
            </View>
          }
        >
          <LinearGradient
            colors={colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ width: dimensions.width, height: dimensions.height }}
          />
        </MaskedView>
      ) : (
        <View
          onLayout={onLayout}
          style={{ width: '100%', alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={textStyle}>{lines.join('\n')}</Text>
        </View>
      )}
    </View>
  );
};

