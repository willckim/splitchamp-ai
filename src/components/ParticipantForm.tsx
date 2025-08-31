import { useState } from 'react';
import { View, TextInput, Pressable, Text, Alert } from 'react-native';
import { useSplitStore } from '@/store/useSplitStore';

export default function ParticipantForm() {
  const [name, setName] = useState('');
  const participants = useSplitStore(s => s.participants);
  const addParticipant = useSplitStore(s => s.addParticipant);

  const onAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Name required', 'Please enter a participant name.');
      return;
    }
    const exists = participants.some(p => p.name.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      Alert.alert('Already added', `"${trimmed}" is already in the list.`);
      return;
    }
    addParticipant(trimmed);
    setName('');
  };

  return (
    <View style={{ gap: 8 }}>
      <TextInput
        placeholder="Add participant (e.g., Alice)"
        value={name}
        onChangeText={setName}
        style={{
          borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12,
        }}
      />
      <Pressable
        onPress={onAdd}
        disabled={!name.trim()}
        style={{
          backgroundColor: name.trim() ? '#2563eb' : '#94a3b8',
          padding: 12, borderRadius: 10, alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Add</Text>
      </Pressable>
    </View>
  );
}
