import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';

import { errorDetail } from '../api/client';
import { joinTable } from '../api/tables';
import Button from '../components/Button';
import { t } from '../i18n';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Join'>;

/** Join a friend's table with its 6-character code (no 0/O/1/I/L: codes are read aloud). */
export default function JoinScreen({ navigation }: Props) {
  const { c, space, radius, type } = useTheme();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function join() {
    setBusy(true);
    setError('');
    try {
      const table = await joinTable(code);
      navigation.replace(table.status === 'lobby' ? 'Lobby' : 'Table', { tableId: table.id });
    } catch (e) {
      setError(errorDetail(e, t('common.somethingWrong')));
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                          style={{ flex: 1, backgroundColor: c.surface }}>
      <View style={{ padding: space.space4, gap: space.space3, maxWidth: 480, width: '100%', alignSelf: 'center' }}>
        <Text style={[type.body, { color: c.inkSoft }]}>{t('join.hint')}</Text>
        <TextInput
          value={code}
          onChangeText={(text) => setCode(text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
          placeholder="K7Q2MX"
          placeholderTextColor={c.inkSoft}
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
          accessibilityLabel={t('join.code')}
          returnKeyType="go"
          onSubmitEditing={() => code.length === 6 && join()}
          style={[type.title, { color: c.ink, backgroundColor: c.surfaceSunken, borderRadius: radius.radiusMd,
                                paddingHorizontal: space.space4, paddingVertical: space.space3, letterSpacing: 6,
                                textAlign: 'center', fontVariant: ['tabular-nums'] }]}
        />
        {error ? <Text style={[type.body, { color: c.invalidInk }]}>{error}</Text> : null}
        <Button label={t('join.submit')} onPress={join} busy={busy} disabled={code.length !== 6} />
      </View>
    </KeyboardAvoidingView>
  );
}
