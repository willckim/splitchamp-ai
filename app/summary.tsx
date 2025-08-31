import { View, Text } from 'react-native';
import SummaryCard from '../src/components/SummaryCard';

export default function SummaryScreen() {
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <SummaryCard />
    </View>
  );
}
