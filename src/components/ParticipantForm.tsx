import { useState } from 'react';
import { View, TextInput, Pressable, Text, Alert } from 'react-native';
import { useSplitStore } from '@/store/useSplitStore';
import { useTheme } from '../providers/theme'; // ← adjust path if needed

export default function ParticipantForm() {
  const { theme } = useTheme();
  const [name, setName] = useState('');

  const participants = useSplitStore(s => s.participants);
  const addParticipant = useSplitStore(s => s.addParticipant);

  const onAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Name required', 'Please enter a participant name.');
      return;
    }
    const exists = participants.some(
      p => p.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (exists) {
      Alert.alert('Already added', `"${trimmed}" is already in the list.`);
      return;
    }
    addParticipant(trimmed);
    setName('');
  };

  const canAdd = !!name.trim();
  // subtle disabled button color based on theme.accent
  const disabledBg = `${theme.accent}55`;

  return (
    <View
      style={{
        gap: 8,
        backgroundColor: theme.card,
        borderColor: theme.border,
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
      }}
    >
      <TextInput
        placeholder="Add participant (e.g., Alice)"
        value={name}
        onChangeText={setName}
        placeholderTextColor={`${theme.text}66`}
        selectionColor={theme.accent}
        keyboardAppearance={theme.statusBarStyle === 'dark' ? 'light' : 'dark'}
        style={{
          color: theme.text,
          backgroundColor: theme.bg,   // improves contrast inside the card on dark themes
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: 10,
          padding: 12,
        }}
        returnKeyType="done"
        onSubmitEditing={onAdd}
        accessibilityLabel="Participant name"
      />

      <Pressable
        onPress={onAdd}
        disabled={!canAdd}
        style={{
          backgroundColor: canAdd ? theme.accent : disabledBg,
          padding: 12,
          borderRadius: 10,
          alignItems: 'center',
        }}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canAdd }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Add</Text>
      </Pressable>
    </View>
  );
}