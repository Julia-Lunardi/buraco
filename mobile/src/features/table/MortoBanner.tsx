import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Text } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../theme';
import Card from './Card';

/** How long "Ana pegou o morto!" stays down. */
export const MORTO_BANNER_MS = 3000;

/** A banner that drops from the top when someone takes a morto: gold when it's your team, the
 * table's raised green with a red edge when it's theirs. The phone buzzes either way. */
export default function MortoBanner({ text, ours }: { text: string; ours: boolean }) {
  const { c, type } = useTheme();
  const insets = useSafeAreaInsets();
  const k = useSharedValue(0);
  useEffect(() => {
    k.value = withSequence(withSpring(1, { damping: 14, stiffness: 180 }),
                           withDelay(MORTO_BANNER_MS - 700, withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) })));
    void Haptics.notificationAsync(ours ? Haptics.NotificationFeedbackType.Success
      : Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, [k, ours]);
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, k.value * 2), transform: [{ translateY: (k.value - 1) * 90 }] }));

  return (
    <Animated.View pointerEvents="none" accessibilityLiveRegion="assertive" accessibilityRole="alert"
                   style={[{ position: 'absolute', top: insets.top + 8, alignSelf: 'center', zIndex: 200, maxWidth: '92%',
                             flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingLeft: 12,
                             paddingRight: 18, borderRadius: 16, borderWidth: 2,
                             backgroundColor: ours ? c.accent : c.tableRaised, borderColor: ours ? c.accent : c.invalid,
                             boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)' }, style]}>
      <Card faceDown size="pile" style={{ transform: [{ scale: 0.5 }, { rotate: '-12deg' }], margin: -14 }} />
      <Text style={[type.bodyStrong, { color: ours ? c.onAccent : c.tableInk, flexShrink: 1 }]}>{text}</Text>
    </Animated.View>
  );
}
