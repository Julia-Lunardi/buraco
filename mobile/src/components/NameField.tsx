import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { errorDetail } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { t } from '../i18n';
import { useTheme } from '../theme';
import Button from './Button';

/** The name other players see. Shown in Settings, and before creating or joining a friends'
 * table when the account has none yet (Apple sends a name only once; guests have none). */
export default function NameField({ compact }: { compact?: boolean }) {
  const { c, space, radius, size, type } = useTheme();
  const { user, updateName } = useAuth();
  const [name, setName] = useState(user?.display_name ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function save() {
    setBusy(true);
    setMessage('');
    try {
      await updateName(name.trim());
      setMessage(t('settings.nameSaved'));
    } catch (e) {
      setMessage(errorDetail(e, t('common.somethingWrong')));
    } finally {
      setBusy(false);
    }
  }

  const unchanged = name.trim() === (user?.display_name ?? '') || !name.trim();
  return (
    <View style={{ gap: space.space2 }}>
      <Text style={[type.bodyStrong, { color: c.ink }]}>{t('settings.name')}</Text>
      {!compact ? <Text style={[type.caption, { color: c.inkSoft }]}>{t('settings.nameHint')}</Text> : null}
      <View style={{ flexDirection: 'row', gap: space.space2, alignItems: 'center' }}>
        <TextInput value={name} onChangeText={setName} maxLength={40} autoCapitalize="words" autoCorrect={false}
                   accessibilityLabel={t('settings.name')} returnKeyType="done" onSubmitEditing={() => !unchanged && save()}
                   style={[type.body, { flex: 1, color: c.ink, backgroundColor: c.surfaceSunken, minHeight: size.touchMin,
                                        borderRadius: radius.radiusMd, paddingHorizontal: space.space3 }]} />
        <Button label={t('settings.save')} variant="secondary" onPress={save} busy={busy} disabled={unchanged} />
      </View>
      {message ? <Text style={[type.caption, { color: c.inkSoft }]} accessibilityLiveRegion="polite">{message}</Text> : null}
    </View>
  );
}
