import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { TextField } from '../../../theme/components';
import { validateContact } from '../contactValidation';
import { useTheme } from '../../../theme/ThemeProvider';
import type { Enums } from '../../../lib/database.types';
import {
  useAddContact,
  useContacts,
  useDeleteContact,
  useUpdateContact,
} from '../hooks';

const ALL_PLATFORMS: Enums<'contact_platform'>[] = [
  'instagram',
  'facebook',
  'tiktok',
  'youtube',
  'whatsapp',
  'phone',
  'email',
  'other',
];

const PLATFORM_LABELS: Record<Enums<'contact_platform'>, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  whatsapp: 'WhatsApp',
  phone: 'Phone',
  email: 'Email',
  other: 'Other',
};

export function ContactsSection({ profileId }: { profileId: string | undefined }) {
  const { colors, fonts, fs, radii } = useTheme();
  const { data: contacts, isLoading } = useContacts(profileId);
  const addContact = useAddContact(profileId);
  const updateContact = useUpdateContact(profileId);
  const deleteContact = useDeleteContact(profileId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHandle, setEditHandle] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [newPlatform, setNewPlatform] = useState<Enums<'contact_platform'> | null>(null);
  const [newHandle, setNewHandle] = useState('');
  const [newError, setNewError] = useState<string | null>(null);

  const contactList = contacts ?? [];
  const usedPlatforms = new Set(contactList.map((c) => c.platform));
  const availablePlatforms = ALL_PLATFORMS.filter((p) => !usedPlatforms.has(p));
  const canDelete = contactList.length > 1;

  const startEdit = (id: string, currentHandle: string) => {
    setEditingId(id);
    setEditHandle(currentHandle);
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  // Edits are validated too. They previously weren't checked at all beyond
  // "not empty", so a good handle could be replaced with a broken one.
  const saveEdit = () => {
    if (!editingId) return;
    const contact = contactList.find((c) => c.id === editingId);
    if (!contact) return;
    const result = validateContact(contact.platform, editHandle);
    if (!result.ok) {
      setEditError(result.error);
      return;
    }
    setEditError(null);
    updateContact.mutate(
      { id: editingId, handle: result.value },
      { onSuccess: () => setEditingId(null) }
    );
  };

  // Backing out of adding a contact. Without this, tapping a platform chip by
  // mistake left the field open with no way to dismiss it.
  const cancelNewContact = () => {
    setNewPlatform(null);
    setNewHandle('');
    setNewError(null);
  };

  const submitNewContact = () => {
    if (!newPlatform) return;
    const result = validateContact(newPlatform, newHandle);
    if (!result.ok) {
      setNewError(result.error);
      return;
    }
    setNewError(null);
    // The canonical form is stored, not the raw text.
    addContact.mutate(
      { platform: newPlatform, handle: result.value },
      { onSuccess: cancelNewContact }
    );
  };

  const smallButtonText = { fontFamily: fonts.condensedSemi, fontSize: fs(11), letterSpacing: 1, textTransform: 'uppercase' as const, color: colors.brass };

  return (
    <View>
      <Text
        style={{
          fontFamily: fonts.mono,
          fontSize: fs(9),
          letterSpacing: 1.6,
          textTransform: 'uppercase',
          color: colors.ink2,
        }}
      >
        Contacts
      </Text>
      <Text style={{ fontFamily: fonts.body, fontSize: fs(12.5), color: colors.ink2, marginTop: 4, marginBottom: 9 }}>
        You need at least one way for a match to reach you.
      </Text>

      {isLoading && <ActivityIndicator color={colors.brass} />}

      {contactList.map((contact) => (
        <View key={contact.id} style={[styles.row, { backgroundColor: colors.fieldBg, borderRadius: radii.rSm }]}>
          <Text
            style={{
              fontFamily: fonts.condensed,
              fontSize: fs(11.5),
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: colors.ink2,
              marginBottom: 4,
            }}
          >
            {PLATFORM_LABELS[contact.platform]}
          </Text>
          {editingId === contact.id ? (
            <View style={styles.editRow}>
              <TextField style={styles.editInput} value={editHandle} onChangeText={setEditHandle} autoFocus />
              <Pressable style={styles.smallButton} onPress={saveEdit}>
                <Text style={smallButtonText}>Save</Text>
              </Pressable>
              <Pressable style={styles.smallButton} onPress={cancelEdit}>
                <Text style={smallButtonText}>Cancel</Text>
              </Pressable>
            </View>
          ) : null}
          {editingId === contact.id && editError ? (
            <Text style={{ fontFamily: fonts.body, fontSize: fs(12.5), color: colors.red, marginTop: 6 }}>
              {editError}
            </Text>
          ) : null}
          {editingId !== contact.id ? (
            <View style={styles.editRow}>
              <Text style={{ fontFamily: fonts.mono, fontSize: fs(13), color: colors.ink, flex: 1 }}>
                {contact.handle}
              </Text>
              <Pressable style={styles.smallButton} onPress={() => startEdit(contact.id, contact.handle)}>
                <Text style={smallButtonText}>Edit</Text>
              </Pressable>
              <Pressable
                style={[styles.smallButton, !canDelete && styles.smallButtonDisabled]}
                disabled={!canDelete}
                onPress={() => deleteContact.mutate(contact.id)}
              >
                <Text style={smallButtonText}>Delete</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ))}

      {availablePlatforms.length > 0 ? (
        <View style={styles.addSection}>
          <View style={styles.chipRow}>
            {availablePlatforms.map((p) => {
              const selected = newPlatform === p;
              return (
                <Pressable
                  key={p}
                  style={[
                    styles.platformChip,
                    {
                      borderRadius: radii.pill,
                      borderColor: selected ? colors.brass : colors.line,
                      backgroundColor: selected ? colors.brass : 'transparent',
                    },
                  ]}
                  onPress={() => setNewPlatform(p)}
                >
                  <Text
                    style={{
                      fontFamily: fonts.condensedSemi,
                      fontSize: fs(11.5),
                      letterSpacing: 0.8,
                      textTransform: 'uppercase',
                      color: selected ? colors.bg : colors.ink,
                    }}
                  >
                    {PLATFORM_LABELS[p]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {newPlatform && (
            <View style={styles.editRow}>
              <TextField
                style={styles.editInput}
                placeholder="Handle / number / address"
                value={newHandle}
                onChangeText={setNewHandle}
              />
              <Pressable style={styles.smallButton} onPress={submitNewContact}>
                <Text style={smallButtonText}>Add contact</Text>
              </Pressable>
              <Pressable style={styles.smallButton} onPress={cancelNewContact}>
                <Text style={smallButtonText}>Cancel</Text>
              </Pressable>
            </View>
          )}
          {newError ? (
            <Text style={{ fontFamily: fonts.body, fontSize: fs(12.5), color: colors.red, marginTop: 6 }}>
              {newError}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text style={{ fontFamily: fonts.body, fontSize: fs(12.5), color: colors.ink2 }}>
          All contact platforms added.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editInput: {
    flex: 1,
  },
  smallButton: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  smallButtonDisabled: {
    opacity: 0.4,
  },
  addSection: {
    marginTop: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  platformChip: {
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
});
