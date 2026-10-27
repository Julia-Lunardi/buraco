import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '../../i18n';
import { useTheme } from '../../theme';
import { useTipJar } from './useTipJar';

/** "Apoie o app": reached only from Settings. Contributions toward the servers, three
 * equally weighted buttons, the store's own prices, and quiet outcomes: a cancel shows
 * nothing, a thank-you is one line, nothing celebrates. */
export default function SupportScreen() {
  const { c, space, radius, size, type } = useTheme();
  const insets = useSafeAreaInsets();
  const { status, products, buying, buy, dismiss, retryLoad } = useTipJar();

  const message = { thanks: t('support.thanks'), pending: t('support.pending'), failed: t('support.failed') }[
    status as 'thanks' | 'pending' | 'failed'];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.surface }}
                contentContainerStyle={{ padding: space.space4, paddingBottom: insets.bottom + space.space6,
                                         gap: space.space4, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      <Text style={[type.body, { color: c.ink }]}>{t('support.body')}</Text>

      {status === 'loading' ? (
        <View style={{ alignItems: 'center', gap: space.space2, paddingVertical: space.space5 }}>
          <ActivityIndicator color={c.inkSoft} />
          <Text style={[type.caption, { color: c.inkSoft }]}>{t('support.loading')}</Text>
        </View>
      ) : null}

      {status === 'unavailable' ? (
        <View style={{ gap: space.space3 }}>
          <Text style={[type.body, { color: c.inkSoft }]}>{t('support.unavailable')}</Text>
          <Pressable onPress={() => { void retryLoad(); }} accessibilityRole="button"
                     style={{ minHeight: size.touchMin, justifyContent: 'center' }}>
            <Text style={[type.label, { color: c.accentInk }]}>{t('common.tryAgain')}</Text>
          </Pressable>
        </View>
      ) : null}

      {message ? (
        <View accessibilityLiveRegion="polite" style={{ gap: space.space3 }}>
          <Text style={[type.bodyStrong, { color: status === 'failed' ? c.invalidInk : c.ink }]}>{message}</Text>
          <Pressable onPress={dismiss} accessibilityRole="button"
                     style={{ minHeight: size.touchMin, justifyContent: 'center' }}>
            <Text style={[type.label, { color: c.accentInk }]}>{t('support.done')}</Text>
          </Pressable>
        </View>
      ) : null}

      {(status === 'ready' || status === 'purchasing') ? (
        <View style={{ gap: space.space3 }}>
          {products.map((product) => (
            <Pressable
              key={product.id}
              onPress={() => { void buy(product.id); }}
              disabled={status === 'purchasing'}
              accessibilityRole="button"
              accessibilityLabel={`${t(`support.${product.id}`)}, ${product.displayPrice}`}
              style={({ pressed }) => ({
                minHeight: 56, borderRadius: radius.radiusMd, paddingHorizontal: space.space4,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: c.surfaceRaised, borderWidth: 1, borderColor: c.line,
                opacity: pressed || (status === 'purchasing' && buying !== product.id) ? 0.6 : 1,
              })}
            >
              <Text style={[type.bodyStrong, { color: c.ink }]}>{t(`support.${product.id}`)}</Text>
              {buying === product.id ? <ActivityIndicator color={c.inkSoft} />
                : <Text style={[type.bodyStrong, { color: c.ink, fontVariant: ['tabular-nums'] }]}>{product.displayPrice}</Text>}
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Keyed by platform: the iOS build never shows "Google Play" and vice versa (Playbook F). */}
      <Text style={[type.caption, { color: c.inkSoft }]}>
        {Platform.OS === 'ios' ? t('support.storeNote_ios') : t('support.storeNote_android')}
      </Text>
    </ScrollView>
  );
}
