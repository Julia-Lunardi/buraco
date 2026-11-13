import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';

import { t } from '../../i18n';
import { useTheme } from '../../theme';

/** The system's badge red (iOS uses the same): an unread count has to be seen across the felt,
 * and no colour in the design tokens is meant to shout. White figures on it in both themes. */
const BADGE_RED = '#FF3B30';

/** Opens the table chat. A red bubble with the number of new messages sits on its corner, and
 * pops each time another one arrives. */
export default function ChatButton({ unread, onPress }: { unread: number; onPress(): void }) {
  const { c, type } = useTheme();
  const pop = useSharedValue(1);
  useEffect(() => {
    if (unread > 0) pop.value = withSequence(withTiming(1.35, { duration: 120 }), withSpring(1, { damping: 8, stiffness: 220 }));
  }, [unread, pop]);
  const badge = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={4}
               accessibilityLabel={unread ? `${t('chat.open')}, ${t('chat.unread', { n: unread })}` : t('chat.open')}
               style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.table, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="chatbubble-ellipses" size={22} color={c.tableInk} />
      {unread ? (
        <Animated.View style={[{ position: 'absolute', top: -4, right: -6, minWidth: 22, height: 22, paddingHorizontal: 6,
                                 borderRadius: 11, backgroundColor: BADGE_RED, alignItems: 'center', justifyContent: 'center',
                                 borderWidth: 2, borderColor: c.tableRaised }, badge]}>
          <Text style={{ color: '#FFFFFF', fontFamily: type.label.fontFamily, fontSize: 12, lineHeight: 15,
                         fontVariant: ['tabular-nums'] }}>{unread > 99 ? '99+' : unread}</Text>
        </Animated.View>
      ) : null}
    </Pressable>
  );
}
