import { useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '../../theme';
import Card from './Card';
import { useFlights } from './flights';
import { useCardSizes } from './sizes';

/** How much of each back shows: just the top, fading into their area as if held below its edge. */
const PEEK = 0.38;

/** An opponent's hand as you'd see it across a real table: one face-down card per card in
 * their hand, at the table's card size, overlapped in a straight row squeezed to fit the room
 * it has. The count stays on the avatar. */
export default function BacksFan({ n, seat, maxWidth }: { n: number; seat: number; maxWidth?: number }) {
  const { table } = useCardSizes();
  const flights = useFlights();
  const { c } = useTheme();
  const [room, setRoom] = useState(maxWidth ?? 160);
  const { w, h } = table;
  const width = Math.min(room, maxWidth ?? room);
  // Tight like a hand held closed: an edge of each card, not a spread.
  const step = n > 1 ? Math.max(3, Math.min(w * 0.16, (width - w) / (n - 1))) : 0;
  const rowW = n ? w + step * (n - 1) : 0;
  const peek = Math.round(h * PEEK);
  const left = Math.max(0, (width - rowW) / 2);
  return (
    <View onLayout={maxWidth ? undefined : (e) => setRoom(e.nativeEvent.layout.width)}
          importantForAccessibility="no-hide-descendants" accessibilityElementsHidden pointerEvents="none"
          style={{ flex: maxWidth ? undefined : 1, minWidth: 0, width: maxWidth ? Math.min(rowW, maxWidth) : undefined,
                   height: peek }}>
      {/* Absolute, so the row never widens its slot (it would push past the buttons beside it). */}
      <View style={{ position: 'absolute', left, top: 0, width: rowW, height: peek,
                     overflow: 'hidden' }}>
        {Array.from({ length: n }, (_, i) => (
          <Card key={i} faceDown size="table" style={{ position: 'absolute', left: i * step, top: 0 }} />
        ))}
        {/* No hard cut: the lower half of the strip fades into the panel. */}
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: peek * 0.6,
                       experimental_backgroundImage: `linear-gradient(to bottom, transparent, ${c.tableRaised})` }} />
      </View>
      {/* Where this player's cards fly to and from: a card-sized spot at the end of the row,
          so a flying card keeps its size (flights scale to the target's width). */}
      <View collapsable={false} ref={(view) => flights?.register(`seat:${seat}`, view)}
            style={{ position: 'absolute', left: left + step * Math.max(0, n - 1), top: 0, width: w, height: h }} />
    </View>
  );
}
