import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { t } from '../../i18n';
import { useTheme } from '../../theme';

/** Live tables: the current turn's clock. A bot finishes the turn when it runs out. Shown at
 * most at the turn's full length: the server adds time for the bot moves being replayed. */
export default function TurnClock({ deadline, limit, mine }: { deadline: number; limit: number; mine: boolean }) {
  const { c, radius, type } = useTheme();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [deadline]);

  const left = Math.max(0, Math.min(limit, Math.ceil((deadline - now) / 1000)));
  const urgent = mine && left <= 10;
  const color = urgent ? c.onAccent : c.tableInk;
  return (
    <View accessible accessibilityLabel={t(mine ? 'table.clockMineA11y' : 'table.clockA11y', { n: left })}
          accessibilityLiveRegion={urgent ? 'polite' : 'none'}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, height: 26,
                   borderRadius: radius.radiusPill, backgroundColor: urgent ? c.accent : c.tableRaised }}>
      <Ionicons name="time-outline" size={14} color={color} />
      <Text style={[type.label, { fontSize: 13, lineHeight: 18, color, fontVariant: ['tabular-nums'] }]}>
        0:{String(left).padStart(2, '0')}
      </Text>
    </View>
  );
}
