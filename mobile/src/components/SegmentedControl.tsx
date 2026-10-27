import { Pressable, Text, View } from 'react-native';

import { useTheme } from '../theme';

interface Props<T extends string> {
  value: T;
  // NoInfer: T comes from `value` alone, so ('2' | '4') isn't widened to string by the options.
  options: { value: NoInfer<T>; label: string }[];
  onChange(value: NoInfer<T>): void;
  accessibilityLabel: string;
}

/** Design system `SegmentedControl`: a sunken track, the chosen segment raised. */
export default function SegmentedControl<T extends string>({ value, options, onChange, accessibilityLabel }: Props<T>) {
  const { c, space, radius, size, type } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}
          style={{ flexDirection: 'row', backgroundColor: c.surfaceSunken, borderRadius: radius.radiusMd,
                   padding: space.space1, gap: space.space1 }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={{ flex: 1, minHeight: size.touchMin - 8, alignItems: 'center', justifyContent: 'center',
                     borderRadius: radius.radiusMd - 4, backgroundColor: selected ? c.surfaceRaised : 'transparent' }}
          >
            <Text style={[type.label, { color: selected ? c.ink : c.inkSoft }]} numberOfLines={1}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
