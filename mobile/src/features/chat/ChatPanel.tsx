import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setChatEnabled } from '../../api/chat';
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
 * quick phrases. Long-press a message for mute / report / block (both stores require report
 * and block for user content). The host can turn chat off. */
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

          <FlatList
            data={chat.messages}
            keyExtractor={(m) => String(m.id)}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ padding: space.space4, gap: space.space2 }}
            ListEmptyComponent={<Text style={[type.body, { color: c.tableInkSoft }]}>{t('chat.empty')}</Text>}
            renderItem={({ item }) => {
              const mine = item.user_id === myUserId;
              return (
                <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: space.space1 }}>
                  <Pressable
                    onLongPress={mine ? undefined : () => setActionsFor(item)}
                    accessibilityHint={mine ? undefined : t('chat.actions', { name: name(item) })}
                    style={{ maxWidth: '85%', backgroundColor: mine ? c.accent : c.table, borderRadius: radius.radiusMd,
                             paddingHorizontal: space.space3, paddingVertical: space.space2 }}>
                    {!mine ? <Text style={[type.caption, { color: item.seat % 2 === 0 ? c.teamA : c.teamB }]}>
                      {item.seat % 2 === 0 ? '● ' : '◆ '}{name(item)}</Text> : null}
                    <Text style={[type.body, { color: mine ? c.onAccent : c.tableInk }]}>{item.text}</Text>
                  </Pressable>
                  {actionsFor?.id === item.id ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.space2 }}>
                      {[
                        [chat.isMuted(item.user_id) ? t('chat.unmute', { name: name(item) }) : t('chat.mute', { name: name(item) }),
                         () => { chat.toggleMute(item.user_id); setActionsFor(null); }],
                        [t('chat.report'), () => run(() => chat.report(item), t('chat.reported'))],
                        [t('chat.block', { name: name(item) }),
                         () => run(() => chat.block(item.user_id), t('chat.blocked', { name: name(item) }))],
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
              <View style={{ flexDirection: 'row', gap: space.space2, paddingHorizontal: space.space4, alignItems: 'center' }}>
                <TextInput value={text} onChangeText={setText} placeholder={t('chat.placeholder')} maxLength={300}
                           placeholderTextColor={c.tableInkSoft} returnKeyType="send" onSubmitEditing={() => submit(text)}
                           accessibilityLabel={t('chat.placeholder')}
                           style={[type.body, { flex: 1, color: c.tableInk, backgroundColor: c.table, minHeight: size.touchMin,
                                                borderRadius: radius.radiusMd, paddingHorizontal: space.space3 }]} />
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
