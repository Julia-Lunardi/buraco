import { useMemo, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { REACTIONS, setChatEnabled } from '../../api/chat';
import { errorDetail } from '../../api/client';
import type { TableView } from '../../api/tables';
import Button from '../../components/Button';
import { t } from '../../i18n';
import type { ChatMessage } from '../../realtime/tableSocket';
import { useTheme } from '../../theme';
import type { useChat } from './useChat';

interface Props {
  visible: boolean;
  onClose(): void;
  table: TableView;
  chat: ReturnType<typeof useChat>;
  myUserId: string | undefined;
  send(text: string): void;
}

/** Design system chat panel: slides up over the table (table colours), short messages and
 * quick phrases. Long-press a message to react with an emoji and, on someone else's, for
 * mute / report / block (both stores require report and block for user content). Reactions
 * sit under the bubble as chips; tapping one adds or takes back yours. The host can turn chat off. */
export default function ChatPanel({ visible, onClose, table, chat, myUserId, send }: Props) {
  const { c, space, radius, shadow, size, type } = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [actionsFor, setActionsFor] = useState<ChatMessage | null>(null);
  const [notice, setNotice] = useState('');
  const phrases = t('chat.phrases').split('|');

  function submit(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    send(trimmed);
    setText('');
  }

  function react(message: ChatMessage, emoji: string) {
    setActionsFor(null);
    void Haptics.selectionAsync().catch(() => {});
    chat.react(message, emoji).catch((e) => setNotice(errorDetail(e, t('common.somethingWrong'))));
  }

  async function run(action: () => Promise<void>, done: string) {
    setActionsFor(null);
    try {
      await action();
      setNotice(done);
    } catch (e) {
      setNotice(errorDetail(e, t('common.somethingWrong')));
    }
  }

  const name = (m: ChatMessage) => m.name || '—'; // senders are always people
  const newestFirst = useMemo(() => [...chat.messages].reverse(), [chat.messages]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                            style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: c.scrim }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel={t('chat.close')} />
        <View style={{ maxHeight: '75%', backgroundColor: c.tableRaised, borderTopLeftRadius: radius.radiusLg,
                       borderTopRightRadius: radius.radiusLg, boxShadow: shadow.shadowSheet,
                       paddingBottom: insets.bottom + space.space3, width: '100%', maxWidth: 640, alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                         paddingHorizontal: space.space4, paddingTop: space.space3 }}>
            <Text style={[type.heading, { color: c.tableInk }]} accessibilityRole="header">{t('chat.title')}</Text>
            <View style={{ flexDirection: 'row', gap: space.space3 }}>
              {table.is_host ? (
                <Pressable onPress={() => setChatEnabled(table.id, !table.chat_enabled).catch(() => {})}
                           accessibilityRole="button" style={{ minHeight: size.touchMin, justifyContent: 'center' }}>
                  <Text style={[type.label, { color: c.accent }]}>
                    {table.chat_enabled ? t('chat.turnOff') : t('chat.turnOn')}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable onPress={onClose} accessibilityRole="button"
                         style={{ minHeight: size.touchMin, justifyContent: 'center' }}>
                <Text style={[type.label, { color: c.tableInkSoft }]}>{t('chat.close')}</Text>
              </Pressable>
            </View>
          </View>

          {/* Inverted: opens on the newest message, at the bottom by the input, and stays there as
              new ones arrive; scrolling up reads back. */}
          {chat.messages.length ? null : (
            <Text style={[type.body, { color: c.tableInkSoft, padding: space.space4 }]}>{t('chat.empty')}</Text>
          )}
          <FlatList
            inverted
            data={newestFirst}
            keyExtractor={(m) => String(m.id)}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ padding: space.space4, gap: space.space2 }}
            renderItem={({ item }) => {
              const mine = item.user_id === myUserId;
              const chips = chat.reactions(item);
              const open = actionsFor?.id === item.id;
              return (
                <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: space.space1 }}>
                  <Pressable
                    onLongPress={table.chat_enabled ? () => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setActionsFor(open ? null : item);
                    } : undefined}
                    accessibilityHint={table.chat_enabled ? t('chat.reactHint') : undefined}
                    style={{ maxWidth: '85%', backgroundColor: mine ? c.accent : c.table, borderRadius: radius.radiusMd,
                             paddingHorizontal: space.space3, paddingVertical: space.space2,
                             borderWidth: 1.5, borderColor: open ? c.tableInk : 'transparent' }}>
                    {!mine ? <Text style={[type.caption, { color: item.seat % 2 === 0 ? c.teamA : c.teamB }]}>
                      {item.seat % 2 === 0 ? '● ' : '◆ '}{name(item)}</Text> : null}
                    <Text style={[type.body, { color: mine ? c.onAccent : c.tableInk }]}>{item.text}</Text>
                  </Pressable>
                  {chips.length ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.space1, marginTop: -2,
                                   justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                      {chips.map((chip) => (
                        <Pressable key={chip.emoji} onPress={table.chat_enabled ? () => react(item, chip.emoji) : undefined}
                                   accessibilityRole="button" hitSlop={6}
                                   accessibilityLabel={t('chat.reactionA11y', { emoji: chip.emoji, n: chip.count })}
                                   accessibilityState={{ selected: chip.mine }}
                                   style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2,
                                            borderRadius: radius.radiusPill, backgroundColor: c.table, borderWidth: 1,
                                            borderColor: chip.mine ? c.accent : c.tableLine }}>
                          <Text style={{ fontSize: 14, lineHeight: 18 }}>{chip.emoji}</Text>
                          {chip.count > 1 ? <Text style={[type.caption, { color: c.tableInk, fontVariant: ['tabular-nums'] }]}>{chip.count}</Text> : null}
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {open ? (
                    <View style={{ flexDirection: 'row', alignSelf: mine ? 'flex-end' : 'flex-start', gap: 2, padding: 4,
                                   borderRadius: radius.radiusPill, backgroundColor: c.table, boxShadow: shadow.shadowCard }}>
                      {REACTIONS.map((emoji) => {
                        const chosen = item.reactions?.some((r) => r.user_id === myUserId && r.emoji === emoji);
                        return (
                          <Pressable key={emoji} onPress={() => react(item, emoji)} accessibilityRole="button"
                                     accessibilityLabel={t('chat.reactWith', { emoji })} accessibilityState={{ selected: !!chosen }}
                                     style={{ width: size.touchMin, height: size.touchMin, borderRadius: size.touchMin / 2,
                                              alignItems: 'center', justifyContent: 'center',
                                              backgroundColor: chosen ? 'rgba(232, 178, 74, 0.25)' : 'transparent' }}>
                            <Text style={{ fontSize: 24, lineHeight: 30 }}>{emoji}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                  {open ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.space2, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                      {[
                        ...(mine ? [] : [
                          [chat.isMuted(item.user_id) ? t('chat.unmute', { name: name(item) }) : t('chat.mute', { name: name(item) }),
                           () => { chat.toggleMute(item.user_id); setActionsFor(null); }],
                          [t('chat.report'), () => run(() => chat.report(item), t('chat.reported'))],
                          [t('chat.block', { name: name(item) }),
                           () => run(() => chat.block(item.user_id), t('chat.blocked', { name: name(item) }))],
                        ]),
                        [t('common.cancel'), () => setActionsFor(null)],
                      ].map(([label, onPress]) => (
                        <Pressable key={label as string} onPress={onPress as () => void} accessibilityRole="button"
                                   style={{ minHeight: size.touchMin, justifyContent: 'center', paddingHorizontal: space.space2,
                                            borderRadius: radius.radiusPill, borderWidth: 1, borderColor: c.tableLine }}>
                          <Text style={[type.label, { color: c.tableInk }]}>{label as string}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            }}
          />

          {notice ? <Text style={[type.caption, { color: c.tableInkSoft, paddingHorizontal: space.space4 }]}
                          accessibilityLiveRegion="polite">{notice}</Text> : null}

          {table.chat_enabled ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{ gap: space.space2, paddingHorizontal: space.space4, paddingVertical: space.space2 }}>
                {phrases.map((phrase) => (
                  <Pressable key={phrase} onPress={() => submit(phrase)} accessibilityRole="button"
                             style={{ minHeight: size.touchMin, justifyContent: 'center', paddingHorizontal: space.space3,
                                      borderRadius: radius.radiusPill, backgroundColor: c.table }}>
                    <Text style={[type.label, { color: c.tableInk }]}>{phrase}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <View style={{ flexDirection: 'row', gap: space.space2, paddingHorizontal: space.space4, alignItems: 'flex-end' }}>
                {/* Multiline so a long message wraps (and grows up to 4 lines, then scrolls) instead of
                    running off to the right; the return key still sends. */}
                <TextInput value={text} onChangeText={setText} placeholder={t('chat.placeholder')} maxLength={300}
                           placeholderTextColor={c.tableInkSoft} returnKeyType="send" onSubmitEditing={() => submit(text)}
                           multiline submitBehavior="submit" textAlignVertical="center" scrollEnabled
                           accessibilityLabel={t('chat.placeholder')}
                           style={[type.body, { flex: 1, color: c.tableInk, backgroundColor: c.table, minHeight: size.touchMin,
                                                maxHeight: type.body.lineHeight * 4 + 20, borderRadius: radius.radiusMd,
                                                paddingHorizontal: space.space3, paddingTop: 10, paddingBottom: 10 }]} />
                <Button label={t('chat.send')} onPress={() => submit(text)} disabled={!text.trim()} />
              </View>
            </>
          ) : (
            <Text style={[type.body, { color: c.tableInkSoft, paddingHorizontal: space.space4 }]}>{t('chat.off')}</Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
