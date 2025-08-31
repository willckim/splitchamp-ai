import { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import Markdown from 'react-native-markdown-display';
import * as FileSystem from 'expo-file-system';
import { Asset } from 'expo-asset';

type Props = { assetModule: number; title: string };

export default function MarkdownScreen({ assetModule, title }: Props) {
  const [content, setContent] = useState<string>('# Loading…');

  useEffect(() => {
    (async () => {
      try {
        const asset = Asset.fromModule(assetModule);
        if (!asset.localUri) await asset.downloadAsync();
        const fileUri = asset.localUri!;
        const md = await FileSystem.readAsStringAsync(fileUri);
        setContent(md);
      } catch {
        setContent(`# ${title}\n\nUnable to load document.`);
      }
    })();
  }, [assetModule, title]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '800', marginBottom: 12 }}>{title}</Text>
      <Markdown>{content}</Markdown>
    </ScrollView>
  );
}
