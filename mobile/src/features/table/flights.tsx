import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import type { GameView } from '../../api/tables';
import Card from './Card';
import { CARD_MOVE_MS, FLIGHT_EASE, FLIGHT_MS } from './timing';
import { type FlightPlan, planFlights } from './planFlights';
import { useCardSizes } from './sizes';

/** A drawn card turns face up over the last 45% of its flight. */
const FLIP_FROM = 0.55;

interface Rect { x: number; y: number; w: number; h: number }

interface FlightsApi {
  /** Attach to a host View: `card:<id>`, `seat:<n>`, `stock`, `discard`, `hand`. */
  register(key: string, view: View | null): void;
  /** How long a card just mounted should stay hidden: until its flight lands. */
  arrival(id: number): number;
}

const FlightsContext = createContext<FlightsApi | null>(null);
export const useFlights = () => useContext(FlightsContext);

const measure = (view: View) => new Promise<Rect | null>((resolve) => {
  try {
    view.measureInWindow((x, y, w, h) => resolve(w || h ? { x, y, w, h } : null));
  } catch {
    resolve(null);
  }
});

interface Flight { key: string; label: string | null; flip: boolean; from: Rect; to: Rect; delay: number }

/**
 * Cards fly across the felt: each change of `game` is diffed (planFlights) and every card that
 * moved travels from where it was to where it lands, while the real card waits hidden. Where a
 * card was is remembered from the last settled layout, since by now it has already left.
 */
export function useCardFlights(game: GameView | null) {
  const views = useRef(new Map<string, View>());
  const last = useRef(new Map<string, Rect>()); // positions after the previous change settled
  const origin = useRef<View | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);

  // The plan is derived during render (from the previous game kept in state), so cards that
  // mount in this same render already know to wait for their flight.
  const [track, setTrack] = useState<{ game: GameView | null; plan: FlightPlan[] }>({ game, plan: [] });
  if (track.game !== game) setTrack({ game, plan: planFlights(track.game, game) });
  const plan = track.plan;

  const arrivals = useMemo(() => new Map(plan.filter((p) => p.id !== null).map((p) => [p.id!, p.delay + FLIGHT_MS])),
                           [plan]);

  const remember = useCallback(async () => {
    const entries = [...views.current.entries()];
    const rects = await Promise.all(entries.map(([, view]) => measure(view)));
    const next = new Map<string, Rect>();
    entries.forEach(([key], i) => { if (rects[i]) next.set(key, rects[i]!); });
    last.current = next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const base = origin.current ? await measure(origin.current) : null;
      const at = async (keys: string[], fresh: boolean) => {
        for (const key of keys) {
          const view = views.current.get(key);
          const rect = fresh && view ? await measure(view) : last.current.get(key) ?? (view ? await measure(view) : null);
          if (rect) return { ...rect, x: rect.x - (base?.x ?? 0), y: rect.y - (base?.y ?? 0) };
        }
        return null;
      };
      const launched: Flight[] = [];
      for (const [i, p] of plan.entries()) {
        const [from, to] = [await at(p.from, false), await at(p.to, true)];
        if (from && to) launched.push({ key: `${Date.now()}-${i}`, label: p.label, flip: !!p.flip, from, to, delay: p.delay });
      }
      if (!cancelled && launched.length) setFlights((all) => [...all, ...launched]);
    })();
    // Remember where everything ended up once flights land and the rows finish gliding.
    const settle = setTimeout(() => { void remember(); }, Math.max(...plan.map((p) => p.delay), 0) + FLIGHT_MS + CARD_MOVE_MS);
    return () => { cancelled = true; clearTimeout(settle); };
  }, [plan, remember]);

  const api = useMemo<FlightsApi>(() => ({
    register: (key, view) => { if (view) views.current.set(key, view); else views.current.delete(key); },
    arrival: (id) => arrivals.get(id) ?? 0,
  }), [arrivals]);

  const done = useCallback((key: string) => setFlights((all) => all.filter((f) => f.key !== key)), []);

  return {
    /** Call when the layout moved without a game change (scroll, rotation). */
    remember,
    api,
    layer: (
      <View ref={origin} pointerEvents="none" style={StyleSheet.absoluteFill} collapsable={false}>
        {flights.map((f) => <FlyingCard key={f.key} flight={f} onDone={done} />)}
      </View>
    ),
  };
}

/** Shares the flights with the cards and seats below. */
export function FlightsProvider({ api, children }: { api: FlightsApi; children: ReactNode }) {
  return <FlightsContext.Provider value={api}>{children}</FlightsContext.Provider>;
}

function FlyingCard({ flight, onDone }: { flight: Flight; onDone(key: string): void }) {
  const { table } = useCardSizes();
  const p = useSharedValue(0);
  const { from, to, delay } = flight;

  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: FLIGHT_MS, easing: FLIGHT_EASE }));
    const t = setTimeout(() => onDone(flight.key), delay + FLIGHT_MS + 40);
    return () => clearTimeout(t);
  }, [delay, flight.key, onDone, p]);

  // Centre to centre, scaling from the source's width to the target's, on a slight arc.
  const [fx, fy, tx, ty] = [from.x + from.w / 2, from.y + from.h / 2, to.x + to.w / 2, to.y + to.h / 2];
  const [fs, ts] = [from.w / table.w, to.w / table.w];
  const lift = Math.min(36, Math.hypot(tx - fx, ty - fy) * 0.12);
  const flip = flight.flip;
  const style = useAnimatedStyle(() => {
    const k = p.value;
    // A turned card narrows to its edge and widens again showing its face, over the last part of the way.
    const f = flip ? Math.min(1, Math.max(0, (k - FLIP_FROM) / (1 - FLIP_FROM))) : 0;
    return {
      transform: [
        { translateX: fx + (tx - fx) * k - table.w / 2 },
        { translateY: fy + (ty - fy) * k - table.h / 2 - Math.sin(Math.PI * k) * lift },
        { scale: fs + (ts - fs) * k },
        { scaleX: flip ? Math.max(0.02, Math.abs(Math.cos(Math.PI * f))) : 1 },
      ],
    };
  });
  const back = useAnimatedStyle(() => ({ opacity: !flip || p.value < FLIP_FROM + (1 - FLIP_FROM) / 2 ? 1 : 0 }));
  const face = useAnimatedStyle(() => ({ opacity: flip && p.value >= FLIP_FROM + (1 - FLIP_FROM) / 2 ? 1 : 0 }));

  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, zIndex: 100 }, style]}>
      {flip ? (
        <>
          <Animated.View style={back}><Card faceDown size="table" /></Animated.View>
          <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, face]}>
            <Card label={flight.label ?? undefined} size="table" />
          </Animated.View>
        </>
      ) : <Card label={flight.label ?? undefined} faceDown={!flight.label} size="table" />}
    </Animated.View>
  );
}
