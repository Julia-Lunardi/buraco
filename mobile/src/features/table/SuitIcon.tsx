import Svg, { Circle, Path } from 'react-native-svg';

/** The design system's suit shapes (Buraco.SuitIcon), drawn, not a font. */
export default function SuitIcon({ suit, size, color }: { suit: string | null; size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      {suit === 'H' ? <Path d="M12 21C5 16 2 12.5 2 8.6 2 5.8 4.2 3.6 7 3.6c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 2.8 0 5 2.2 5 5 0 3.9-3 7.4-10 12.4z" />
        : suit === 'D' ? <Path d="M12 2l7.5 10L12 22 4.5 12z" />
        : suit === 'S' ? <Path d="M12 2C7 7 3 10 3 13.6 3 16 4.9 18 7.3 18c1.5 0 2.8-.7 3.6-1.8L10 22h4l-.9-5.8c.8 1.1 2.1 1.8 3.6 1.8 2.4 0 4.3-2 4.3-4.4C21 10 17 7 12 2z" />
        : suit === 'C' ? (
          <>
            <Circle cx={12} cy={7} r={4.3} /><Circle cx={6.8} cy={13.4} r={4.3} /><Circle cx={17.2} cy={13.4} r={4.3} />
            <Path d="M11 12h2l1.4 10H9.6z" />
          </>
        ) : <Path d="M12 2l2.9 6.6 7.1.7-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.3l7.1-.7z" />}
    </Svg>
  );
}
