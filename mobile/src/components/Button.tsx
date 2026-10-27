import { ActivityIndicator, Pressable, Text } from 'react-native';

import { useTheme } from '../theme';

interface Props {
  label: string;
  onPress(): void;
  variant?: 'primary' | 'secondary' | 'quiet';
  disabled?: boolean;
  busy?: boolean;
  accessibilityHint?: string;
}

/** Design system `Button`. Primary is the one gold accent with `onAccent` text (8.4:1);
 * secondary is a raised outline; quiet is a text button. At least 44pt tall. */
export default function Button({ label, onPress, variant = 'primary', disabled, busy, accessibilityHint }: Props) {
  const { c, space, radius, size, type } = useTheme();
  const colors = {
    primary: { bg: c.accent, fg: c.onAccent, border: c.accent },
    secondary: { bg: c.surfaceRaised, fg: c.ink, border: c.line },
    quiet: { bg: 'transparent', fg: c.accentInk, border: 'transparent' },
  }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => ({
        minHeight: Math.max(size.touchMin, 52), paddingHorizontal: space.space4, borderRadius: radius.radiusMd,
        alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg,
        borderWidth: variant === 'secondary' ? 1 : 0, borderColor: colors.border,
        opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
      })}
    >
      {busy ? <ActivityIndicator color={colors.fg} />
        : <Text style={[type.label, { color: colors.fg }]} numberOfLines={1}>{label}</Text>}
    </Pressable>
  );
}
