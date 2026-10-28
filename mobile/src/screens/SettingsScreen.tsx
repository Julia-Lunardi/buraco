import Ionicons from '@expo/vector-icons/Ionicons';
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
import { LANGUAGES, type LanguagePref, t } from '../i18n';
import { usePreferences } from '../settings/PreferencesContext';
import { palette, useTheme } from '../theme';

export default function SettingsScreen() {
  const { name, c, space, radius, type } = useTheme();
  const insets = useSafeAreaInsets();
  const prefs = usePreferences();
  const { user, signOut, deleteAccount } = useAuth();
  const guest = !!user?.is_guest;
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

  // A guest's games live only in this guest account: signing out loses them, signing in keeps them.
  function confirmGuestSignOut() {
    Alert.alert(t('settings.guestSignOutTitle'), t('settings.guestSignOutBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.guestSignOutConfirm'), style: 'destructive', onPress: () => { void signOut(); } },
    ]);
  }

  // Grouped like the design ("Ajustes"): a small caps title, then a raised card of rows.
  const group = (title: string, ...rows: React.ReactNode[]) => (
    <View style={{ gap: space.space2 }}>
      <Text style={[type.caption, { color: c.inkSoft, fontFamily: type.label.fontFamily, letterSpacing: 0.3,
                                    textTransform: 'uppercase', paddingHorizontal: 4 }]} accessibilityRole="header">{title}</Text>
      <View style={{ backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.line, borderRadius: radius.radiusMd,
                     paddingHorizontal: space.space4, paddingVertical: 4 }}>
        {rows.filter(Boolean).map((r, i) => (
          <View key={i} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>{r}</View>
        ))}
      </View>
    </View>
  );
  const item = (text: string, control: React.ReactNode) => (
    <View style={{ gap: space.space2, paddingVertical: 12 }}>
      <Text style={[type.body, { color: c.ink }]}>{text}</Text>
      {control}
    </View>
  );
  const link = (text: string, onPress: () => void, color = c.ink) => (
    <Pressable onPress={onPress} accessibilityRole="button"
               style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                                          opacity: pressed ? 0.6 : 1 })}>
      <Text style={[type.body, { color }]}>{text}</Text>
      <Ionicons name="chevron-forward" size={18} color={c.inkSoft} />
    </Pressable>
  );
  const language = (value: LanguagePref, text: string) => {
    const on = prefs.language === value;
    return (
      <Pressable key={value} onPress={() => prefs.set('language', value)} accessibilityRole="radio"
                 accessibilityState={{ selected: on }}
                 style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                                            opacity: pressed ? 0.6 : 1 })}>
        <Text style={[type.body, { color: c.ink }]}>{text}</Text>
        {on ? <Ionicons name="checkmark" size={20} color={c.accentInk} /> : null}
      </Pressable>
    );
  };
  const felt = (value: 'green' | 'blue', text: string) => {
    const on = prefs.felt === value;
    return (
      <Pressable key={value} onPress={() => prefs.set('felt', value)} accessibilityRole="radio" accessibilityState={{ selected: on }}
                 style={{ flex: 1, minHeight: 64, borderRadius: radius.radiusMd, borderWidth: 2, justifyContent: 'flex-end',
                          paddingVertical: 8, paddingHorizontal: 10, borderColor: on ? c.accent : 'transparent',
                          backgroundColor: value === 'green' ? palette(name, 'green').table : palette(name, 'blue').table }}>
        <Text style={[type.caption, { fontFamily: type.label.fontFamily, color: c.tableInk }]}>{text}</Text>
      </Pressable>
    );
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface }}
                contentContainerStyle={{ padding: space.space4, paddingBottom: insets.bottom + space.space6,
                                         gap: space.space5, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
      {group(t('settings.cardsAndTable'),
        item(t('settings.felt'), (
          <View accessibilityRole="radiogroup" accessibilityLabel={t('settings.felt')} style={{ flexDirection: 'row', gap: 10 }}>
            {felt('green', t('settings.feltGreen'))}
            {felt('blue', t('settings.feltBlue'))}
          </View>
        )),
        item(t('table.sortHand'), (
          <SegmentedControl value={prefs.sort} onChange={(v) => prefs.set('sort', v)} accessibilityLabel={t('table.sortHand')}
            options={[{ value: 'suit', label: t('table.sortSuit') }, { value: 'rank', label: t('table.sortRank') }]} />
        )),
      )}

      {group(t('settings.screen'),
        item(t('settings.orientation'), (
          <SegmentedControl value={prefs.orientation} onChange={(v) => prefs.set('orientation', v)}
            accessibilityLabel={t('settings.orientation')}
            options={[{ value: 'auto', label: t('settings.orientationAuto') },
                      { value: 'portrait', label: t('settings.orientationPortrait') },
                      { value: 'landscape', label: t('settings.orientationLandscape') }]} />
        )),
        item(t('settings.appearance'), (
          <SegmentedControl value={prefs.theme} onChange={(v) => prefs.set('theme', v)} accessibilityLabel={t('settings.appearance')}
            options={[{ value: 'system', label: t('settings.themeSystem') }, { value: 'light', label: t('settings.themeLight') },
                      { value: 'dark', label: t('settings.themeDark') }]} />
        )),
      )}

      {group(t('settings.language'),
        language('system', t('settings.languageSystem')),
        ...LANGUAGES.map((l) => language(l.value, l.name)),
      )}

      {guest ? group(t('settings.account'),
        <Pressable onPress={() => navigation.navigate('Account')} accessibilityRole="button"
                   style={({ pressed }) => ({ minHeight: 56, paddingVertical: 10, flexDirection: 'row', alignItems: 'center',
                                              gap: space.space3, opacity: pressed ? 0.6 : 1 })}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.bodyStrong, { color: c.accentInk }]}>{t('settings.guestSignIn')}</Text>
            <Text style={[type.caption, { color: c.inkSoft }]}>{t('settings.guestSignInHint')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.inkSoft} />
        </Pressable>,
        error ? <Text style={[type.body, { color: c.invalidInk, paddingVertical: 12 }]}>{error}</Text> : null,
        link(t('settings.signOut'), confirmGuestSignOut, c.invalidInk),
        link(t('settings.deleteAccount'), confirmDelete, c.invalidInk),
      ) : group(t('settings.account'),
        <View style={{ paddingVertical: 12 }}><NameField /></View>,
        error ? <Text style={[type.body, { color: c.invalidInk, paddingVertical: 12 }]}>{error}</Text> : null,
        link(t('settings.signOut'), () => { void signOut(); }),
        link(t('settings.deleteAccount'), confirmDelete, c.invalidInk),
      )}

      {/* The only way to the Support screen: no prompts anywhere else, never after a game. */}
      {group(t('settings.about'),
        link(t('settings.support'), () => navigation.navigate('Support')),
        LEGAL_URLS.privacy ? link(t('settings.privacy'), () => Linking.openURL(LEGAL_URLS.privacy)) : null,
        LEGAL_URLS.terms ? link(t('settings.terms'), () => Linking.openURL(LEGAL_URLS.terms)) : null,
        // The card faces' licence asks for this exact line and a link, visible in the app; untranslated.
        <Pressable onPress={() => Linking.openURL('https://www.magnific.com')} accessibilityRole="link"
                   style={({ pressed }) => ({ minHeight: 56, paddingVertical: 10, flexDirection: 'row', alignItems: 'center',
                                              gap: space.space3, opacity: pressed ? 0.6 : 1 })}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[type.body, { color: c.ink }]}>{t('settings.cardArt')}</Text>
            <Text style={[type.caption, { color: c.inkSoft }]}>Designed by Magnific · www.magnific.com</Text>
          </View>
          <Ionicons name="open-outline" size={18} color={c.inkSoft} />
        </Pressable>,
      )}
      <Text style={[type.caption, { color: c.inkSoft, textAlign: 'center' }]}>{t('settings.footer')}</Text>
    </ScrollView>
  );
}
