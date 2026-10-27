import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { errorDetail } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import NameField from '../components/NameField';
import SegmentedControl from '../components/SegmentedControl';
import { LEGAL_URLS } from '../config';
import type { RootStackParamList } from '../navigation/types';
import { t } from '../i18n';
import { usePreferences } from '../settings/PreferencesContext';
import { useTheme } from '../theme';

export default function SettingsScreen() {
  const { c, space, radius, type } = useTheme();
  const insets = useSafeAreaInsets();
  const prefs = usePreferences();
  const { signOut, deleteAccount } = useAuth();
  const [error, setError] = useState('');
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  function confirmDelete() {
    // In-app account deletion is an App Store requirement.
    Alert.alert(t('settings.deleteAccount'), t('settings.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.deleteConfirmButton'), style: 'destructive',
        onPress: () => deleteAccount().catch((e) => setError(errorDetail(e, t('common.somethingWrong')))),
      },
    ]);
  }

  const section = (title: string) => (
    <Text style={[type.caption, { color: c.inkSoft, marginTop: space.space5, textTransform: 'uppercase',
                                  letterSpacing: 0.6 }]}>{title}</Text>
  );
  const label = (text: string) => <Text style={[type.bodyStrong, { color: c.ink }]}>{text}</Text>;
  const row = (text: string, onPress: () => void, color = c.ink) => (
    <Pressable onPress={onPress} accessibilityRole="button"
               style={({ pressed }) => ({ minHeight: 48, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <Text style={[type.body, { color }]}>{text}</Text>
    </Pressable>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface }}
                contentContainerStyle={{ padding: space.space4, paddingBottom: insets.bottom + space.space6,
                                         gap: space.space3, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
      {section(t('settings.appearance'))}
      {label(t('settings.theme'))}
      <SegmentedControl value={prefs.theme} onChange={(v) => prefs.set('theme', v)} accessibilityLabel={t('settings.theme')}
        options={[{ value: 'system', label: t('settings.themeSystem') }, { value: 'light', label: t('settings.themeLight') },
                  { value: 'dark', label: t('settings.themeDark') }]} />
      {label(t('settings.felt'))}
      <SegmentedControl value={prefs.felt} onChange={(v) => prefs.set('felt', v)} accessibilityLabel={t('settings.felt')}
        options={[{ value: 'green', label: t('settings.feltGreen') }, { value: 'blue', label: t('settings.feltBlue') }]} />
      <View style={{ flexDirection: 'row', gap: space.space2 }}>
        {(['green', 'blue'] as const).map((felt) => (
          <View key={felt} style={{ flex: 1, height: 28, borderRadius: radius.radiusXs,
                                    backgroundColor: felt === 'green' ? c.table : c.tableAlt,
                                    opacity: prefs.felt === felt ? 1 : 0.4 }} />
        ))}
      </View>
      {label(t('settings.orientation'))}
      <SegmentedControl value={prefs.orientation} onChange={(v) => prefs.set('orientation', v)}
        accessibilityLabel={t('settings.orientation')}
        options={[{ value: 'auto', label: t('settings.orientationAuto') },
                  { value: 'portrait', label: t('settings.orientationPortrait') },
                  { value: 'landscape', label: t('settings.orientationLandscape') }]} />

      {section(t('settings.account'))}
      <NameField />
      {error ? <Text style={[type.body, { color: c.invalidInk }]}>{error}</Text> : null}
      {row(t('settings.signOut'), () => { void signOut(); })}
      {row(t('settings.deleteAccount'), confirmDelete, c.invalidInk)}

      {/* The only way to the Support screen: no prompts anywhere else, never after a game. */}
      {row(t('settings.support'), () => navigation.navigate('Support'), c.accentInk)}

      {(LEGAL_URLS.privacy || LEGAL_URLS.terms) ? <View style={{ height: space.space4 }} /> : null}
      {LEGAL_URLS.privacy ? row(t('settings.privacy'), () => Linking.openURL(LEGAL_URLS.privacy), c.accentInk) : null}
      {LEGAL_URLS.terms ? row(t('settings.terms'), () => Linking.openURL(LEGAL_URLS.terms), c.accentInk) : null}
    </ScrollView>
  );
}
