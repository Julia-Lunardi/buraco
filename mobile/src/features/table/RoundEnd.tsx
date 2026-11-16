import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing, FadeIn, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';

import type { TableView } from '../../api/tables';
import { t } from '../../i18n';
import { useTheme } from '../../theme';
import { roundOutcome } from './roundOutcome';
import SuitIcon from './SuitIcon';

/** How long the moment holds before the points replace it (a tap skips ahead). */
export const ROUND_END_MS = 3200;
const STAMP_LANDS_MS = 260;
const SKIP_AFTER_MS = 700; // a tap meant for the last card mustn't skip it unseen

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
 * The round just ended: before the points, a stamp slams onto the felt and the phone thumps,
 * and a one-liner sets the mood. Then the summary. Whoever was looking elsewhere when the last
 * card went down still sees what happened.
 * - Won the round (your team scored more): confetti falls and the phone buzzes success. If your
 *   side also went out, the stamp says so: "Você venceu a rodada!".
 * - Lost it: a grey drizzle falls and the stamp sags; the phone buzzes a warning. If they also
 *   went out: "Ana venceu a rodada!".
 * - A tie: the old burst of suits. "Acabou o monte!" only when the stock ran out with no morto
 *   left (a morto that becomes the stock keeps the round going).
 */
export default function RoundEnd({ table, onDone }: { table: TableView; onDone(): void }) {
  const { c, type } = useTheme();
  const { wentOut: who, mood } = roundOutcome(table) ?? { wentOut: 'stock' as const, mood: 'tie' as const };
  const good = mood === 'won';
  const solo = table.num_players === 2;
  const opponent = table.seats.find((s) => s.team !== (table.my_seat ?? 0) % 2);
  const name = opponent?.bot && !opponent.name ? t('newTable.bot') : opponent?.name ?? '';

  // One joke per round, picked by the round number, so a re-render never swaps it mid-read.
  const seed = table.rounds.length * 31 + (table.round_endings?.at(-1) ?? 9) + (table.code?.charCodeAt(0) ?? 0);
  const { title, line } = useMemo(() => {
    const them = solo && name ? 'them' : 'themTeam';
    // Went out and won the round: the stamp says who won it. Otherwise it says who went out.
    const title = who === 'stock' ? t('roundEnd.stock')
      : (who === 'you' || who === 'us') && mood === 'won' ? t(who === 'you' && solo ? 'roundEnd.youWonRound' : 'roundEnd.usWonRound')
      : who === 'them' && mood === 'lost' ? t(`roundEnd.${them}WonRound`, { name })
      : who === 'you' ? t('roundEnd.you') : who === 'us' ? t('roundEnd.us') : t(`roundEnd.${them}`, { name });
    const lines = mood === 'won' ? (who === 'us' && !solo ? 'roundEnd.usLines' : 'roundEnd.winLines')
      : mood === 'lost' ? 'roundEnd.loseLines' : who === 'stock' ? 'roundEnd.stockLines' : 'roundEnd.tieLines';
    return { title, line: pick(t(lines), seed) };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once per round end
  }, []);

  const stamp = useSharedValue(0);
  const shake = useSharedValue(0);
  const ring = useSharedValue(0);
  const sag = useSharedValue(0);
  const skippable = useRef(false);

  useEffect(() => {
    stamp.value = withSpring(1, { damping: 11, stiffness: 170, mass: 0.9 });
    shake.value = withDelay(STAMP_LANDS_MS, withSequence(
      withTiming(1, { duration: 45 }), withTiming(-1, { duration: 70 }), withTiming(0.6, { duration: 60 }),
      withTiming(-0.3, { duration: 55 }), withTiming(0, { duration: 50 })));
    ring.value = withDelay(STAMP_LANDS_MS, withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) }));
    // A lost round: the stamp wilts a moment after it lands.
    if (mood === 'lost') sag.value = withDelay(STAMP_LANDS_MS + 450, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.cubic) }));
    const thump = setTimeout(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    }, STAMP_LANDS_MS);
    const verdict = setTimeout(() => {
      if (mood === 'tie') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      else void Haptics.notificationAsync(good ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }, STAMP_LANDS_MS + 260);
    const unlock = setTimeout(() => { skippable.current = true; }, SKIP_AFTER_MS);
    const end = setTimeout(onDone, ROUND_END_MS);
    return () => { clearTimeout(thump); clearTimeout(verdict); clearTimeout(unlock); clearTimeout(end); };
  }, [good, mood, onDone, ring, sag, shake, stamp]);

  // Falls from above the table, big and tilted, and lands askew like a rubber stamp.
  const stampStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, stamp.value * 3),
    transform: [
      { translateX: shake.value * 9 },
      { translateY: sag.value * 14 },
      { scale: 2.3 - 1.3 * stamp.value - 0.06 * sag.value },
      { rotate: `${-16 + 9 * stamp.value + 11 * sag.value}deg` },
    ],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ring.value === 0 ? 0 : 0.7 * (1 - ring.value),
    transform: [{ scale: 0.6 + 1.6 * ring.value }],
  }));

  const ink = mood === 'won' ? c.accent : mood === 'lost' ? c.cardRed : c.tableInk;

  return (
    <Pressable onPress={() => { if (skippable.current) onDone(); }}
               accessibilityRole="button" accessibilityLabel={`${title} ${line}. ${t('roundEnd.tapToSkip')}`}
               style={StyleSheet.absoluteFill}>
      <Animated.View entering={FadeIn.duration(200)}
                     style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, alignItems: 'center', justifyContent: 'center' }]}>
        <Animated.View style={[{ position: 'absolute', width: 240, height: 240, borderRadius: 120, borderWidth: 3,
                                 borderColor: ink }, ringStyle]} />
        {mood === 'tie' ? <SuitBurst color={ink} good seed={seed} /> : null}
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
        {mood === 'won' ? <Confetti seed={seed} colors={[c.accent, c.cardRed, c.teamA, c.teamB, '#f4ead5']} /> : null}
        {mood === 'lost' ? <Drizzle seed={seed} /> : null}
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

/** A won round: confetti falls from above the screen, swaying and tumbling, for about 2.5 s. */
function Confetti({ seed, colors }: { seed: number; colors: string[] }) {
  const { width, height } = useWindowDimensions();
  const pieces = useMemo(() => Array.from({ length: 70 }, (_, i) => {
    const r = (k: number) => jitter(seed + 101, i * 6 + k);
    return { x: r(0) * width, delay: STAMP_LANDS_MS + r(1) * 700, duration: 1700 + r(2) * 900, sway: 10 + r(3) * 22,
             spin: (r(4) - 0.5) * 900, color: colors[i % colors.length], w: 6 + r(5) * 4, round: i % 5 === 0 };
  }), [seed, width, colors]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => <Falling key={i} {...p} fall={height + 40} />)}
    </View>
  );
}

function Falling({ x, delay, duration, sway, spin, color, w, round, fall }: {
  x: number; delay: number; duration: number; sway: number; spin: number; color: string; w: number; round: boolean; fall: number;
}) {
  const k = useSharedValue(0);
  useEffect(() => {
    k.value = withDelay(delay, withTiming(1, { duration, easing: Easing.in(Easing.quad) }));
  }, [k, delay, duration]);
  const style = useAnimatedStyle(() => ({
    opacity: k.value === 0 ? 0 : 1,
    transform: [
      { translateX: x + Math.sin(k.value * 9 + x) * sway },
      { translateY: -20 + fall * k.value },
      { rotate: `${spin * k.value}deg` },
      { scaleY: 0.4 + 0.6 * Math.abs(Math.cos(k.value * 12 + x)) }, // a flat piece turning over
    ],
  }));
  return <Animated.View style={[{ position: 'absolute', top: 0, left: 0, width: w, height: round ? w : w * 1.6,
                                  borderRadius: round ? w / 2 : 1.5, backgroundColor: color }, style]} />;
}

/** A lost round: a short grey drizzle slants down the screen, and the scrim darkens with it. */
function Drizzle({ seed }: { seed: number }) {
  const { width, height } = useWindowDimensions();
  const drops = useMemo(() => Array.from({ length: 46 }, (_, i) => {
    const r = (k: number) => jitter(seed + 211, i * 4 + k);
    return { x: r(0) * (width + 80), delay: STAMP_LANDS_MS + 150 + r(1) * 1500, duration: 650 + r(2) * 350, len: 12 + r(3) * 14 };
  }), [seed, width]);
  const gloom = useSharedValue(0);
  useEffect(() => {
    gloom.value = withDelay(STAMP_LANDS_MS + 150, withTiming(1, { duration: 900 }));
  }, [gloom]);
  const gloomStyle = useAnimatedStyle(() => ({ opacity: 0.22 * gloom.value }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#0b1016' }, gloomStyle]} />
      {drops.map((d, i) => <Drop key={i} {...d} fall={height + 60} />)}
    </View>
  );
}

function Drop({ x, delay, duration, len, fall }: { x: number; delay: number; duration: number; len: number; fall: number }) {
  const k = useSharedValue(0);
  useEffect(() => {
    k.value = withDelay(delay, withTiming(1, { duration, easing: Easing.linear }));
  }, [k, delay, duration]);
  const style = useAnimatedStyle(() => ({
    opacity: k.value === 0 || k.value === 1 ? 0 : 0.55,
    transform: [{ translateX: x - 60 * k.value }, { translateY: -30 + fall * k.value }, { rotate: '14deg' }],
  }));
  return <Animated.View style={[{ position: 'absolute', top: 0, left: 0, width: 1.5, height: len, borderRadius: 1,
                                  backgroundColor: 'rgba(200, 212, 224, 0.9)' }, style]} />;
}
