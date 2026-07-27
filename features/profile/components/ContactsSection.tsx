import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { TextField } from '../../../theme/components';
import { colors, fontSizes, fontWeights, radii, spacing } from '../../../theme/tokens';
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
  const { data: contacts, isLoading } = useContacts(profileId);
  const addContact = useAddContact(profileId);
  const updateContact = useUpdateContact(profileId);
  const deleteContact = useDeleteContact(profileId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHandle, setEditHandle] = useState('');
  const [newPlatform, setNewPlatform] = useState<Enums<'contact_platform'> | null>(null);
  const [newHandle, setNewHandle] = useState('');

  const contactList = contacts ?? [];
  const usedPlatforms = new Set(contactList.map((c) => c.platform));
  const availablePlatforms = ALL_PLATFORMS.filter((p) => !usedPlatforms.has(p));
  const canDelete = contactList.length > 1;

  const startEdit = (id: string, currentHandle: string) => {
    setEditingId(id);
    setEditHandle(currentHandle);
  };

  const saveEdit = () => {
    if (!editingId || !editHandle.trim()) return;
    updateContact.mutate(
      { id: editingId, handle: editHandle.trim() },
      { onSuccess: () => setEditingId(null) }
    );
  };

  const submitNewContact = () => {
    if (!newPlatform || !newHandle.trim()) return;
    addContact.mutate(
      { platform: newPlatform, handle: newHandle.trim() },
      {
        onSuccess: () => {
          setNewPlatform(null);
          setNewHandle('');
        },
      }
    );
  };

  return (
    <View>
      <Text style={styles.sectionTitle}>Contacts</Text>
      <Text style={styles.hint}>You need at least one way for a match to reach you.</Text>

      {isLoading && <ActivityIndicator color={colors.brass} />}

      {contactList.map((contact) => (
        <View key={contact.id} style={styles.row}>
          <Text style={styles.platformLabel}>{PLATFORM_LABELS[contact.platform]}</Text>
          {editingId === contact.id ? (
            <View style={styles.editRow}>
              <TextField
                style={styles.editInput}
                value={editHandle}
                onChangeText={setEditHandle}
                autoFocus
              />
              <Pressable style={styles.smallButton} onPress={saveEdit}>
                <Text style={styles.smallButtonText}>Save</Text>
              </Pressable>
              <Pressable style={styles.smallButton} onPress={() => setEditingId(null)}>
                <Text style={styles.smallButtonText}>Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.editRow}>
              <Text style={styles.handleText}>{contact.handle}</Text>
              <Pressable
                style={styles.smallButton}
                onPress={() => startEdit(contact.id, contact.handle)}
              >
                <Text style={styles.smallButtonText}>Edit</Text>
              </Pressable>
              <Pressable
                style={[styles.smallButton, !canDelete && styles.smallButtonDisabled]}
                disabled={!canDelete}
                onPress={() => deleteContact.mutate(contact.id)}
              >
                <Text style={styles.smallButtonText}>Delete</Text>
              </Pressable>
            </View>
          )}
        </View>
      ))}

      {availablePlatforms.length > 0 ? (
        <View style={styles.addSection}>
          <View style={styles.chipRow}>
            {availablePlatforms.map((p) => (
              <Pressable
                key={p}
                style={[styles.platformChip, newPlatform === p && styles.platformChipSelected]}
                onPress={() => setNewPlatform(p)}
              >
                <Text
                  style={[
                    styles.platformChipText,
                    newPlatform === p && styles.platformChipTextSelected,
                  ]}
                >
                  {PLATFORM_LABELS[p]}
                </Text>
              </Pressable>
            ))}
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
                <Text style={styles.smallButtonText}>Add contact</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : (
        <Text style={styles.hint}>All contact platforms added.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  hint: {
    fontSize: fontSizes.xs,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  row: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  platformLabel: {
    fontSize: fontSizes.sm,
    color: colors.textSecondary,
    fontWeight: fontWeights.medium,
    marginBottom: 4,
  },
  handleText: {
    fontSize: fontSizes.md,
    color: colors.textPrimary,
    flex: 1,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  editInput: {
    flex: 1,
  },
  smallButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.brass,
  },
  smallButtonDisabled: {
    borderColor: colors.disabled,
    opacity: 0.5,
  },
  smallButtonText: {
    color: colors.brassDark,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.semibold,
  },
  addSection: {
    marginTop: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  platformChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.creamDark,
  },
  platformChipSelected: {
    backgroundColor: colors.brass,
    borderColor: colors.brass,
  },
  platformChipText: {
    fontSize: fontSizes.sm,
    color: colors.textPrimary,
  },
  platformChipTextSelected: {
    color: colors.navy,
    fontWeight: fontWeights.semibold,
  },
});
