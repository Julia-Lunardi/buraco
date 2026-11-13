import { useState } from 'react';
import { View } from 'react-native';

import Card from './Card';
import { useCardSizes } from './sizes';

/** How much of each back shows: the top, as if their hand peeks over the edge of their area. */
const PEEK = 0.6;

/** An opponent's hand as you'd see it across a real table: one face-down card per card in
 * their hand, at the table's card size, overlapped in a straight row squeezed to fit the room
 * it has. The count stays on the avatar. */
export default function BacksFan({ n, maxWidth }: { n: number; maxWidth?: number }) {
  const { table } = useCardSizes();
  const [room, setRoom] = useState(maxWidth ?? 160);
  const { w, h } = table;
  const width = Math.min(room, maxWidth ?? room);
  // Tight like a hand held closed: an edge of each card, not a spread.
  const step = n > 1 ? Math.max(3, Math.min(w * 0.16, (width - w) / (n - 1))) : 0;
  const rowW = n ? w + step * (n - 1) : 0;
  const peek = Math.round(h * PEEK);
  return (
    <View onLayout={maxWidth ? undefined : (e) => setRoom(e.nativeEvent.layout.width)}
          importantForAccessibility="no-hide-descendants" accessibilityElementsHidden pointerEvents="none"
          style={{ flex: maxWidth ? undefined : 1, minWidth: 0, width: maxWidth ? Math.min(rowW, maxWidth) : undefined,
                   height: peek }}>
      {/* Absolute, so the row never widens its slot (it would push past the buttons beside it). */}
      <View style={{ position: 'absolute', left: Math.max(0, (width - rowW) / 2), top: 0, width: rowW, height: peek,
                     overflow: 'hidden' }}>
        {Array.from({ length: n }, (_, i) => (
          <Card key={i} faceDown size="table" style={{ position: 'absolute', left: i * step, top: 0 }} />
        ))}
      </View>
    </View>
  );
}
