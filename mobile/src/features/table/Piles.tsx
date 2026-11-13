import { Image, Pressable, Text, View } from 'react-native';

import type { CardView } from '../../api/tables';
import { t } from '../../i18n';
import { useTheme } from '../../theme';
import Card from './Card';
import { CardSlot } from './motion';
import { useFlights } from './flights';
import { useCardSizes } from './sizes';

function Badge({ n }: { n: number }) {
  const { c, radius } = useTheme();
  return (
    <Text style={{ position: 'absolute', right: -8, top: -8, zIndex: 60, minWidth: 22, height: 22, paddingHorizontal: 6,
                   borderRadius: radius.radiusPill, overflow: 'hidden', backgroundColor: c.tableRaised, color: c.tableInk,
                   fontFamily: 'AtkinsonHyperlegibleNext_700Bold', fontSize: 12, lineHeight: 22, textAlign: 'center',
                   fontVariant: ['tabular-nums'] }}>{n}</Text>
  );
}

const BACK = require('../../../assets/cards/back-full.png');

/** How many card edges show under a pile's top card: a full stock shows three, a nearly empty one none. */
export const stockDepth = (count: number) => (count >= 30 ? 3 : count >= 10 ? 2 : count >= 2 ? 1 : 0);

interface DeckProps {
  w: number;
  h: number;
  /** Corner radius of the cards, as the cards on the table have it at this size. */
  r: number;
  /** Card edges showing under the top card, `gap` apart down and to the right. */
  depth: number;
  gap: number;
  /** The gold "draw now" ring, hugging the top card. */
  active?: boolean;
}

/** A face-down pile seen from above: the top card with the back's art, and under it only the
 * edges of the cards below, evenly spaced cream lines (cardBackPattern) down and to the right,
 * with one soft shadow under the whole pile rather than one per card. */
export function DeckStack({ w, h, r, depth, gap, active }: DeckProps) {
  const { c, shadow } = useTheme();
  return (
    <View style={{ width: w + depth * gap, height: h + depth * gap }}>
      {Array.from({ length: depth }, (_, k) => depth - k).map((i) => (
        <View key={i} style={{ position: 'absolute', left: i * gap, top: i * gap, width: w, height: h, borderRadius: r,
                               backgroundColor: c.cardBack, borderWidth: 0.75, borderColor: c.cardBackPattern,
                               boxShadow: i === depth ? shadow.shadowCard : undefined }} />
      ))}
      <View style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, borderRadius: r, overflow: 'hidden',
                     backgroundColor: c.cardBack, boxShadow: depth ? undefined : shadow.shadowCard }}>
        <Image source={BACK} resizeMode="stretch" accessibilityIgnoresInvertColors style={{ width: w, height: h }} />
      </View>
      {active ? (
        <View pointerEvents="none"
              style={{ position: 'absolute', left: -3, top: -3, width: w + 6, height: h + 6, borderRadius: r + 3,
                       borderWidth: 2, borderColor: c.accent, boxShadow: '0 0 16px rgba(232, 178, 74, 0.4)' }} />
      ) : null}
    </View>
  );
}

/** Design system `Stock` (minimal): the face-down pile, its edges thinning as it runs low, and
 * a count badge; it glows when drawing is the move to make, and a tap draws. */
export function Stock({ count, active, onPress }: { count: number; active: boolean; onPress?(): void }) {
  const { radius } = useTheme();
  const { pile } = useCardSizes();
  const r = pile.w < 48 ? radius.radiusXs + 1 : radius.radiusCard; // as Card draws its corners
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
               accessibilityLabel={`${t('table.stock', { n: count })}${active ? `. ${t('table.draw')}` : ''}`}>
      <DeckStack w={pile.w} h={pile.h} r={r} depth={stockDepth(count)} gap={1.5} active={active} />
      <Badge n={count} />
    </Pressable>
  );
}

interface PileProps {
  cards: CardView[];
  width: number;
  /** A tap on the lixo takes it (your turn to draw). */
  takeable?: boolean;
  /** A tap discards the selected card. */
  target?: boolean;
  onTake?(): void;
  onDiscard?(): void;
}

/** Design system `DiscardPile` (spread): every card in the lixo fanned out so all are
 * readable, the last one on top; when it can be taken it glows and a tap on it takes it. */
export function DiscardPile({ cards, width, takeable, target, onTake, onDiscard }: PileProps) {
  const { c, radius } = useTheme();
  const { pile } = useCardSizes();
  const n = cards.length;
  const cw = pile.w;
  const ch = pile.h;
  const maxStep = Math.round(cw * 0.62);
  const minStep = Math.round(cw * 0.42);
  const rows = n > 1 && (width - cw) / (n - 1) < minStep ? 2 : 1;
  const per = Math.ceil(n / rows);
  const step = per > 1 ? Math.min(maxStep, (width - cw) / (per - 1)) : 0;
  const rowGap = Math.round(ch * 0.52);
  const boxW = n ? cw + step * Math.max(0, per - 1) : cw;
  const boxH = ch + rowGap * (rows - 1);
  const onPress = takeable ? onTake : target ? onDiscard : undefined;
  const label = takeable ? t('table.takePile', { n })
    : `${n ? t('table.pile', { n }) : t('table.emptyPile')}${target ? `. ${t('table.discard')}` : ''}`;

  return (
    <View style={{ alignItems: 'flex-start' }}>
      <Pressable onPress={onPress} disabled={!onPress} hitSlop={8}
                 accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={label}
                 style={{ width: boxW, height: boxH, borderRadius: 6,
                          outlineWidth: onPress ? 1.5 : 0, outlineStyle: takeable ? 'solid' : 'dashed', outlineColor: c.accent,
                          outlineOffset: 6, boxShadow: takeable ? '0 0 18px rgba(232, 178, 74, 0.35)' : undefined }}>
        {n ? cards.map((card, i) => (
          <CardSlot key={card.id} id={card.id} left={(i % per) * step} top={Math.floor(i / per) * rowGap} zIndex={i}>
            <Card label={card.label} size="pile" />
          </CardSlot>
        )) : (
          <View style={{ width: cw, height: ch, borderRadius: radius.radiusXs, borderWidth: 1.5, borderStyle: 'dashed',
                         borderColor: c.tableLine }} />
        )}
        {n ? <Badge n={n} /> : null}
      </Pressable>
    </View>
  );
}

/** Morto stacks are smaller than the playing cards: they are set aside, not in play. */
const MORTO_SCALE = 0.62;

interface MortoProps {
  /** Per team: still on the table, and whether that team took it (vs. it became the stock). */
  teams: { morto_waiting: boolean; took_morto: boolean }[];
  myTeam: number;
  label(team: number): string;
  /** One above the other at the table's left edge, theirs on top (portrait); side by side otherwise. */
  vertical?: boolean;
}

/** The two mortos, set aside from the stock as at a real table: ours first, then theirs, each a
 * small face-down stack with its team's name. Once a team takes its morto the cards fly to the
 * taker and an outline marked "pegou" stays, so it's clear all game long who has it. */
export function MortoStacks({ teams, myTeam, label, vertical }: MortoProps) {
  const { c, type } = useTheme();
  const { pile } = useCardSizes();
  const flights = useFlights();
  const w = Math.round(pile.w * MORTO_SCALE);
  const h = Math.round(pile.h * MORTO_SCALE);
  return (
    <View style={{ flexDirection: vertical ? 'column' : 'row', gap: vertical ? 10 : 6 }}>
      {/* Side by side ours comes first; stacked, theirs is on top and ours below, nearer our cards. */}
      {(vertical ? [1 - myTeam, myTeam] : [myTeam, 1 - myTeam]).map((team) => {
        const { morto_waiting: waiting, took_morto: took } = teams[team];
        const mine = team === myTeam;
        const a11y = `${t('table.morto')} ${label(team)}: ${waiting ? t('table.mortoOnTable') : took ? t('table.mortoGone') : t('table.mortoStock')}`;
        return (
          <View key={team} accessible accessibilityLabel={a11y} style={{ alignItems: 'center', gap: 3 }}>
            <View collapsable={false} ref={(view) => flights?.register(`morto:${team}`, view)}
                  style={{ width: w + 2, height: h + 2 }}>
              {waiting ? (
                <DeckStack w={w} h={h} r={Math.max(3, Math.round(w * 0.1))} depth={2} gap={1} />
              ) : (
                <View style={{ width: w, height: h, borderRadius: 4, borderWidth: 1.5, borderStyle: 'dashed',
                               borderColor: took ? (mine ? c.accent : c.invalid) : c.tableLine,
                               alignItems: 'center', justifyContent: 'center' }}>
                  {took ? <Text style={{ fontFamily: type.label.fontFamily, fontSize: 10, lineHeight: 12, textAlign: 'center',
                                         color: mine ? c.accent : c.invalid }}>{t('table.mortoTakenShort')}</Text> : null}
                </View>
              )}
            </View>
            <Text numberOfLines={1} style={{ maxWidth: w + 16, fontFamily: type.label.fontFamily, fontSize: 10, lineHeight: 12,
                                             color: waiting ? c.tableInkSoft : took ? (mine ? c.accent : c.invalid) : c.tableInkSoft }}>
              {label(team)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
