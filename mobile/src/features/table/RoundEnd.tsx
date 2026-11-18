import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing, FadeIn, type SharedValue, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';

import type { TableView } from '../../api/tables';
import { t } from '../../i18n';
import { useTheme } from '../../theme';
import { roundOutcome } from './roundOutcome';
import SuitIcon from './SuitIcon';

/** How long the moment holds before the points replace it (a tap skips ahead). A lost round
 * holds longer: its sad face takes its time to fall. */
export const ROUND_END_MS = 3200;
const LOST_END_MS = 4800;
// A lost round: the stamp's letters gather into a ":(" that falls, zigzagging, to the bottom.
const GATHER_AT = 950;
const GATHER_MS = 650;
const FACE_AT = GATHER_AT + 420;
const FALL_AT = FACE_AT + 380;
const FALL_MS = 2800;
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
 * - Lost it: the phone buzzes a warning, then the stamp's letters slide together into a sad
 *   face, ":(", that drifts down to the bottom of the screen like a falling leaf. If they also
 *   went out, the stamp first says "Ana venceu a rodada!".
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
  const gather = useSharedValue(0); // lost: the letters come together (0 → 1)
  const face = useSharedValue(0); // lost: the ":(" appears
  const fall = useSharedValue(0); // lost: and falls
  const skippable = useRef(false);

  useEffect(() => {
    stamp.value = withSpring(1, { damping: 11, stiffness: 170, mass: 0.9 });
    shake.value = withDelay(STAMP_LANDS_MS, withSequence(
      withTiming(1, { duration: 45 }), withTiming(-1, { duration: 70 }), withTiming(0.6, { duration: 60 }),
      withTiming(-0.3, { duration: 55 }), withTiming(0, { duration: 50 })));
    ring.value = withDelay(STAMP_LANDS_MS, withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) }));
    let pop: ReturnType<typeof setTimeout> | undefined;
    if (mood === 'lost') {
      gather.value = withDelay(GATHER_AT, withTiming(1, { duration: GATHER_MS, easing: Easing.inOut(Easing.cubic) }));
      face.value = withDelay(FACE_AT, withSpring(1, { damping: 9, stiffness: 160 }));
      fall.value = withDelay(FALL_AT, withTiming(1, { duration: FALL_MS, easing: Easing.inOut(Easing.sin) }));
      pop = setTimeout(() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }, FACE_AT);
    }
    const thump = setTimeout(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    }, STAMP_LANDS_MS);
    const verdict = setTimeout(() => {
      if (mood === 'tie') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      else void Haptics.notificationAsync(good ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }, STAMP_LANDS_MS + 260);
    const unlock = setTimeout(() => { skippable.current = true; }, SKIP_AFTER_MS);
    const end = setTimeout(onDone, mood === 'lost' ? LOST_END_MS : ROUND_END_MS);
    return () => { clearTimeout(thump); clearTimeout(verdict); clearTimeout(unlock); clearTimeout(end); clearTimeout(pop); };
  }, [face, fall, gather, good, mood, onDone, ring, shake, stamp]);

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

  // Lost: the banner's frame fades as its letters leave it.
  const frameStyle = useAnimatedStyle(() => ({ opacity: 1 - gather.value }));

  const ink = mood === 'won' ? c.accent : mood === 'lost' ? c.cardRed : c.tableInk;
  const titleStyle = { fontFamily: type.score.fontFamily, fontSize: 38, lineHeight: 44, color: ink, textAlign: 'center' as const };

  return (
    <Pressable onPress={() => { if (skippable.current) onDone(); }}
               accessibilityRole="button" accessibilityLabel={`${title} ${line}. ${t('roundEnd.tapToSkip')}`}
               style={StyleSheet.absoluteFill}>
      <Animated.View entering={FadeIn.duration(200)}
                     style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim, alignItems: 'center', justifyContent: 'center' }]}>
        <Animated.View style={[{ position: 'absolute', width: 240, height: 240, borderRadius: 120, borderWidth: 3,
                                 borderColor: ink }, ringStyle]} />
        {mood === 'tie' ? <SuitBurst color={ink} good seed={seed} /> : null}
        <Animated.View accessibilityLiveRegion="assertive" style={[{ paddingHorizontal: 26, paddingVertical: 14 }, stampStyle]}>
          <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: 14, borderWidth: 4, borderColor: ink,
                                                            backgroundColor: c.tableRaised, boxShadow: '0 10px 30px rgba(0, 0, 0, 0.45)' },
                                 frameStyle]} />
          {mood === 'lost' ? <GatheringTitle text={title} style={titleStyle} gather={gather} />
            : <Text style={titleStyle}>{title}</Text>}
          {mood === 'lost' ? <SadFace color={ink} fontFamily={type.score.fontFamily} face={face} fall={fall} /> : null}
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

type Box = { x: number; y: number; w: number; h: number };

/** The stamp's title, a letter at a time, so the letters can leave the banner: each slides to
 * the middle, shrinking and tumbling, the outer ones first, where they become the sad face.
 * Words still wrap whole. */
function GatheringTitle({ text, style, gather }: { text: string; style: object; gather: SharedValue<number> }) {
  const { width } = useWindowDimensions();
  const words = text.split(' ');
  const count = text.replace(/ /g, '').length;
  // Where each letter sits, from layout: words in the title, letters in their word.
  const [layout, setLayout] = useState<{ title?: Box; words: Record<number, Box>; letters: Record<string, Box> }>({ words: {}, letters: {} });
  const box = (e: LayoutChangeEvent): Box => {
    const { x, y, width: w, height: h } = e.nativeEvent.layout;
    return { x, y, w, h };
  };
  let index = 0;
  return (
    <View onLayout={(e) => { const b = box(e); setLayout((l) => ({ ...l, title: b })); }}
          style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 10, maxWidth: width - 110 }}>
      {words.map((word, wi) => (
        <View key={wi} style={{ flexDirection: 'row' }}
              onLayout={(e) => { const b = box(e); setLayout((l) => ({ ...l, words: { ...l.words, [wi]: b } })); }}>
          {[...word].map((ch, li) => {
            const i = index++;
            const key = `${wi}:${li}`;
            const at = layout.letters[key];
            const w = layout.words[wi];
            const title = layout.title;
            // How far this letter is from the middle of the title: it travels there.
            const dx = at && w && title ? title.w / 2 - (w.x + at.x + at.w / 2) : 0;
            const dy = at && w && title ? title.h / 2 - (w.y + at.y + at.h / 2) : 0;
            const fromEdge = count > 1 ? Math.abs(i - (count - 1) / 2) / ((count - 1) / 2) : 0; // 1 at the ends
            return (
              <Letter key={li} ch={ch} style={style} gather={gather} dx={dx} dy={dy} delay={(1 - fromEdge) * 0.3}
                      spin={(i % 2 ? 1 : -1) * (120 + (i * 37) % 120)}
                      onLayout={(e) => { const b = box(e); setLayout((l) => ({ ...l, letters: { ...l.letters, [key]: b } })); }} />
            );
          })}
        </View>
      ))}
    </View>
  );
}

function Letter({ ch, style, gather, dx, dy, delay, spin, onLayout }: {
  ch: string; style: object; gather: SharedValue<number>; dx: number; dy: number; delay: number; spin: number;
  onLayout(e: LayoutChangeEvent): void;
}) {
  const anim = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, (gather.value - delay) / (1 - delay)));
    return {
      opacity: 1 - p * p,
      transform: [{ translateX: dx * p }, { translateY: dy * p }, { scale: 1 - 0.8 * p }, { rotate: `${spin * p}deg` }],
    };
  });
  return <Animated.Text onLayout={onLayout} style={[style, anim]}>{ch}</Animated.Text>;
}

/** The ":(" the letters became, turned a quarter so it reads as a frowning face. It pops up in
 * the middle of the banner, then drifts down to the bottom of the screen, swinging from side to
 * side like a falling leaf, and fades as it gets there. */
function SadFace({ color, fontFamily, face, fall }: {
  color: string; fontFamily: string; face: SharedValue<number>; fall: SharedValue<number>;
}) {
  const { height } = useWindowDimensions();
  const drop = height * 0.62;
  const style = useAnimatedStyle(() => {
    const f = fall.value;
    const swing = Math.sin(f * Math.PI * 4); // four swings on the way down
    return {
      opacity: Math.min(1, face.value * 2) * (f > 0.85 ? (1 - f) / 0.15 : 1),
      transform: [
        { translateX: swing * 70 * Math.min(1, f * 4) },
        { translateY: drop * f },
        { scale: 0.3 + 0.7 * face.value },
        // Tilts into each swing, as a leaf does; 90° turns ":(" into a frown.
        { rotate: `${90 + Math.cos(f * Math.PI * 4) * 28 * Math.min(1, f * 4)}deg` },
      ],
    };
  });
  return (
    // Upright on the screen, though the stamp lands tilted (-7°).
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '7deg' }] }]}>
      <Animated.Text style={[{ fontFamily, fontSize: 64, lineHeight: 72, color }, style]}>:(</Animated.Text>
    </View>
  );
}
