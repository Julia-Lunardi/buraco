import { useState } from 'react';
import { Image, View } from 'react-native';

import { useCardSizes } from './sizes';

const BACK = require('../../../assets/cards/back-full.png');

/** An opponent's hand as you'd see it across a real table: their cards face down in a gentle
 * fan, one back per card, squeezed to fit the room it has. The count stays on the avatar. */
export default function BacksFan({ n, maxWidth }: { n: number; maxWidth?: number }) {
  const { table } = useCardSizes();
  const [room, setRoom] = useState(maxWidth ?? 120);
  const w = Math.max(16, Math.round(table.w * 0.42));
  const h = Math.round(w * 1.4);
  const width = Math.min(room, maxWidth ?? room);
  const step = n > 1 ? Math.min(w * 0.55, (width - w) / (n - 1)) : 0;
  const spread = Math.min(26, n * 2); // degrees, edge to edge
  const fanW = n ? w + step * (n - 1) : 0;
  return (
    <View onLayout={maxWidth ? undefined : (e) => setRoom(e.nativeEvent.layout.width)}
          importantForAccessibility="no-hide-descendants" accessibilityElementsHidden pointerEvents="none"
          style={{ flex: maxWidth ? undefined : 1, minWidth: 0, height: h + 6, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: fanW, height: h }}>
        {Array.from({ length: n }, (_, i) => {
          const k = n > 1 ? i / (n - 1) - 0.5 : 0;
          return (
            <View key={i} style={{ position: 'absolute', left: i * step, top: 0, width: w, height: h, borderRadius: 3,
                                   overflow: 'hidden', borderWidth: 0.5, borderColor: 'rgba(0, 0, 0, 0.35)',
                                   transformOrigin: 'center bottom',
                                   transform: [{ translateY: k * k * 10 }, { rotate: `${k * spread}deg` }] }}>
              <Image source={BACK} resizeMode="stretch" style={{ width: w, height: h }} />
            </View>
          );
        })}
      </View>
    </View>
  );
}
