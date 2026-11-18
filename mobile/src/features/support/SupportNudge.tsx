import { useEffect, useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Button from '../../components/Button';
import { t } from '../../i18n';
import { useTheme } from '../../theme';

/** Give the result a moment on screen before the sheet slides up. */
const SETTLE_MS = 1200;

/** The support nudge sheet (same shape as the notifications primer): a count of games, the
 * servers line, "Support the app" and "Not now". Never celebrates, never blocks more than
 * one tap. */
export default function SupportNudge({ visible, games, onSupport, onLater }:
  { visible: boolean; games: number; onSupport(): void; onLater(): void }) {
  const { c, space, radius, shadow, type } = useTheme();
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState(false);
  if (!visible && shown) setShown(false); // hidden again: next time it waits once more
  useEffect(() => {
    if (!visible) return undefined;
    const timer = setTimeout(() => setShown(true), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <Modal visible={shown} transparent animationType="slide" onRequestClose={onLater}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: c.scrim }}>
        <View style={{ backgroundColor: c.surfaceRaised, borderTopLeftRadius: radius.radiusLg,
                       borderTopRightRadius: radius.radiusLg, boxShadow: shadow.shadowSheet,
                       padding: space.space5, paddingBottom: insets.bottom + space.space5, gap: space.space3,
                       width: '100%', maxWidth: 560, alignSelf: 'center' }}>
          <Text style={[type.heading, { color: c.ink }]} accessibilityRole="header">
            {t('support.nudgeTitle', { n: games.toLocaleString('pt-BR') })}
          </Text>
          <Text style={[type.body, { color: c.inkSoft }]}>{t('support.nudgeBody')}</Text>
          <Text style={[type.caption, { color: c.inkSoft }]}>{t('support.nudgeWhere')}</Text>
          <Button label={t('support.nudgeSupport')} onPress={onSupport} />
          <Button label={t('support.nudgeLater')} onPress={onLater} variant="quiet" />
        </View>
      </View>
    </Modal>
  );
}
