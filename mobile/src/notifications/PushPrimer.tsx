import { Modal, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Button from '../components/Button';
import { t } from '../i18n';
import { useTheme } from '../theme';

/** The calm explanation before the system prompt (asked once, after the first table,
 * never at launch: iOS asks only once, and a cold prompt gets denied). */
export default function PushPrimer({ visible, onAllow, onLater }: { visible: boolean; onAllow(): void; onLater(): void }) {
  const { c, space, radius, shadow, type } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onLater}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: c.scrim }}>
        <View style={{ backgroundColor: c.surfaceRaised, borderTopLeftRadius: radius.radiusLg,
                       borderTopRightRadius: radius.radiusLg, boxShadow: shadow.shadowSheet,
                       padding: space.space5, paddingBottom: insets.bottom + space.space5, gap: space.space3,
                       width: '100%', maxWidth: 560, alignSelf: 'center' }}>
          <Text style={[type.heading, { color: c.ink }]} accessibilityRole="header">{t('push.title')}</Text>
          <Text style={[type.body, { color: c.inkSoft }]}>{t('push.body')}</Text>
          <Button label={t('push.allow')} onPress={onAllow} />
          <Button label={t('push.notNow')} onPress={onLater} variant="quiet" />
        </View>
      </View>
    </Modal>
  );
}
