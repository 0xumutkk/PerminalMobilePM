import React, { useEffect } from 'react';
import { config } from './config';
import { View, ViewProps } from 'react-native';
import { useColorScheme } from 'nativewind';

export type ModeType = 'light' | 'dark' | 'system';

/**
 * Stripped version of GluestackUIProvider
 * Removed OverlayProvider and ToastProvider to avoid react-dom dependency chain
 */
export function GluestackUIProvider({
  mode = 'light',
  ...props
}: {
  mode?: ModeType;
  children?: React.ReactNode;
  style?: ViewProps['style'];
}) {
  const { colorScheme, setColorScheme } = useColorScheme();

  useEffect(() => {
    setColorScheme(mode);
  }, [mode]);

  return (
    <View
      style={[
        config[colorScheme!],
        { flex: 1, height: '100%', width: '100%' },
        props.style,
      ]}
    >
      {props.children}
    </View>
  );
}
