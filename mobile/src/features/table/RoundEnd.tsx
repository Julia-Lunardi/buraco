import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, FadeIn, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';

import type { TableView } from '../../api/tables';
import { t } from '../../i18n';
import { useTheme } from '../../theme';
import SuitIcon from './SuitIcon';

/** How long the moment holds before the points replace it (a tap skips ahead). */
export const ROUND_END_MS = 3200;
const STAMP_LANDS_MS = 260;
const SKIP_AFTER_MS = 700; // a tap meant for the last card mustn't skip it unseen

type Who = 'you' | 'us' | 'them' | 'stock';

function whoWentOut(table: TableView): Who {
  const out = table.game?.went_out ?? null;
  const me = table.my_seat ?? 0;
  if (out === null) return 'stock';
  if (out === me) return 'you';
  return out % 2 === me % 2 ? 'us' : 'them';
}

/** A fixed scatter in 0..1 for (seed, i): every round looks different, a re-render doesn't. */
const jitter = (seed: number, i: number) => {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const pick = (lines: string, seed: number) => {
  const all = lines.split('|');
  return all[Math.floor(jitter(seed, 7) * all.length)];
};

/**
 * The round just ended: before the points, a stamp slams onto the felt ("Ana bateu!") with a
 * burst of suits, the phone thumps, and a one-liner sets the mood. Then the summary. Whoever
 * was looking elsewhere when the last card went down still sees what happened.
 */
export default function RoundEnd({ table, onDone }: { table: TableView; onDone(): void }) {
  const { c, type } = useTheme();
  const who = whoWentOut(table);
  const good = who === 'you' || who === 'us';
  const opponent = table.seats.find((s) => s.team !== (table.my_seat ?? 0) % 2);
  const name = opponent?.bot && !opponent.name ? t('newTable.bot') : opponent?.name ?? '';

  // One joke per round, picked by the round number, so a re-render never swaps it mid-read.
  const seed = table.rounds.length * 31 + (table.game?.went_out ?? 9) + (table.code?.charCodeAt(0) ?? 0);
  const { title, line } = useMemo(() => ({
    title: who === 'you' ? t('roundEnd.you') : who === 'us' ? t('roundEnd.us') : who === 'stock' ? t('roundEnd.stock')
      : table.num_players === 2 && name ? t('roundEnd.them', { name }) : t('roundEnd.themTeam'),
    line: pick(t(who === 'you' ? 'roundEnd.winLines' : who === 'us' ? 'roundEnd.usLines'
      : who === 'stock' ? 'roundEnd.stockLines' : 'roundEnd.loseLines'), seed),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once per round end
  }), []);

  const stamp = useSharedValue(0);
  const shake = useSharedValue(0);
  const ring = useSharedValue(0);
  const skippable = useRef(false);

  useEffect(() => {
    stamp.value = withSpring(1, { damping: 11, stiffness: 170, mass: 0.9 });
    shake.value = withDelay(STAMP_LANDS_MS, withSequence(
      withTiming(1, { duration: 45 }), withTiming(-1, { duration: 70 }), withTiming(0.6, { duration: 60 }),
      withTiming(-0.3, { duration: 55 }), withTiming(0, { duration: 50 })));
    ring.value = withDelay(STAMP_LANDS_MS, withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) }));
    const thump = setTimeout(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    }, STAMP_LANDS_MS);
    const verdict = setTimeout(() => {
      void Haptics.notificationAsync(good ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }, STAMP_LANDS_MS + 260);
    const unlock = setTimeout(() => { skippable.current = true; }, SKIP_AFTER_MS);
    const end = setTimeout(onDone, ROUND_END_MS);
    return () => { clearTimeout(thump); clearTimeout(verdict); clearTimeout(unlock); clearTimeout(end); };
  }, [good, onDone, ring, shake, stamp]);

  // Falls from above the table, big and tilted, and lands askew like a rubber stamp.
  const stampStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, stamp.value * 3),
    transform: [
      { translateX: shake.value * 9 },
      { scale: 2.3 - 1.3 * stamp.value },
      { rotate: `${-16 + 9 * stamp.value}deg` },
    ],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ring.value === 0 ? 0 : 0.7 * (1 - ring.value),
    transform: [{ scale: 0.6 + 1.6 * ring.value }],
  }));

  const ink = good ? c.accent : who === 'stock' ? c.tableInk : c.cardRed;

  return (
    <Pressable onPress={() => { if (skippable.current) onDone(); }}
               accessibilityRole="button" accessibilityLabel={`${title} ${line}. ${t('roundEnd.tapToSkip')}`}
               style={StyleSheet.absoluteFill}>
      <Animated.View entering={FadeIn.duration(200)}
                     style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, alignItems: 'center', justifyContent: 'center' }]}>
        <Animated.View style={[{ position: 'absolute', width: 240, height: 240, borderRadius: 120, borderWidth: 3,
                                 borderColor: ink }, ringStyle]} />
        <SuitBurst color={ink} good={good} seed={seed} />
        <Animated.View accessibilityLiveRegion="assertive"
                       style={[{ paddingHorizontal: 26, paddingVertical: 14, borderRadius: 14, borderWidth: 4, borderColor: ink,
                                 backgroundColor: c.tableRaised, boxShadow: '0 10px 30px rgba(0, 0, 0, 0.45)' }, stampStyle]}>
          <Text style={{ fontFamily: type.score.fontFamily, fontSize: 38, lineHeight: 44, color: ink, textAlign: 'center' }}>
            {title}
          </Text>
        </Animated.View>
        <Animated.Text entering={FadeIn.delay(STAMP_LANDS_MS + 300).duration(300)}
                       style={[type.bodyStrong, { color: c.tableInk, marginTop: 28, textAlign: 'center', paddingHorizontal: 32 }]}>
          {line}
        </Animated.Text>
        <Animated.Text entering={FadeIn.delay(1300).duration(400)}
                       style={[type.caption, { color: c.tableInkSoft, marginTop: 10 }]}>
          {t('roundEnd.tapToSkip')}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

const SUITS = ['S', 'H', 'D', 'C'];

/** Suits thrown out of the stamp as it lands: a wide, bright burst for a good round,
 * a short slump for a bad one. */
function SuitBurst({ color, good, seed }: { color: string; good: boolean; seed: number }) {
  const pieces = useMemo(() => {
    const count = good ? 14 : 8;
    return Array.from({ length: count }, (_, i) => {
    const r = (k: number) => jitter(seed, i * 4 + k);
    const angle = (i / count) * Math.PI * 2 + r(0) * 0.4;
    const reach = (good ? 130 : 80) + r(1) * 60;
    return { suit: SUITS[i % 4], dx: Math.cos(angle) * reach, dy: Math.sin(angle) * reach + (good ? 0 : 40),
             spin: (r(2) - 0.5) * 540, size: 16 + r(3) * 12 };
    });
  }, [good, seed]);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', width: 0, height: 0 }}>
      {pieces.map((p, i) => <Shard key={i} {...p} color={color} />)}
    </View>
  );
}

function Shard({ suit, dx, dy, spin, size, color }: { suit: string; dx: number; dy: number; spin: number; size: number; color: string }) {
  const k = useSharedValue(0);
  useEffect(() => {
    k.value = withDelay(STAMP_LANDS_MS - 20, withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }));
  }, [k]);
  const style = useAnimatedStyle(() => ({
    opacity: k.value === 0 ? 0 : 1 - k.value * k.value,
    transform: [
      { translateX: dx * k.value - size / 2 },
      { translateY: dy * k.value + 60 * k.value * k.value - size / 2 }, // a little gravity
      { rotate: `${spin * k.value}deg` },
    ],
  }));
  return (
    <Animated.View style={[{ position: 'absolute' }, style]}>
      <SuitIcon suit={suit} size={size} color={color} />
    </Animated.View>
  );
}
