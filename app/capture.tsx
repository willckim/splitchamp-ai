// app/capture.tsx
import { useEffect, useState } from 'react';
import { View, Text, Button, Image, ActivityIndicator, Alert, Switch } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { useCameraPermissions } from 'expo-camera';
import { analyzeReceipt } from '@/lib/ai';
import { useSplitStore } from '@/store/useSplitStore';

export default function CaptureReceipt() {
  const [permission, requestPermission] = useCameraPermissions();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [asItemized, setAsItemized] = useState(true); // NEW: import mode toggle

  const addExpense = useSplitStore(s => s.addExpense);

  // Ask once, only if we can
  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const onTakePhoto = async () => {
    try {
      const camPerm = await requestPermission();
      if (!camPerm.granted) {
        Alert.alert('Permission needed', 'Enable camera in system Settings to scan receipts.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
      });
      if (!res.canceled) setPhotoUri(res.assets[0].uri);
    } catch (err) {
      Alert.alert('Camera error', String(err));
    }
  };

  const onPickFromGallery = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        allowsMultipleSelection: false,
        quality: 0.8,
      });
      if (!res.canceled) setPhotoUri(res.assets[0].uri);
    } catch (err) {
      Alert.alert('Picker error', String(err));
    }
  };

  const onAnalyze = async () => {
    if (!photoUri) return;

    // Require at least one participant to map items
    const participants = useSplitStore.getState().participants;
    if (participants.length === 0) {
      Alert.alert('Add participants first', 'Please add at least one participant before analyzing.');
      return;
    }

    setLoading(true);
    try {
      // Get file info and narrow type
      const info = await FileSystem.getInfoAsync(photoUri, { size: true });

      if (!info.exists) {
        Alert.alert('File not found', 'Please retake the photo.');
        setLoading(false);
        return;
      }
      if ('isDirectory' in info && info.isDirectory) {
        Alert.alert('Invalid file', 'Selected path is a directory, not an image.');
        setLoading(false);
        return;
      }

      // 1) Resize + compress BEFORE base64 (keeps OCR quality while shrinking size)
      const manipulated = await ImageManipulator.manipulateAsync(
        photoUri,
        [{ resize: { width: 1600 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );

      // 2) Check final size (post-compress)
      const postInfo = await FileSystem.getInfoAsync(manipulated.uri, { size: true });
      if (postInfo.exists && 'size' in postInfo && typeof postInfo.size === 'number') {
        if (postInfo.size > 8 * 1024 * 1024) {
          Alert.alert('Image too large', 'Try a closer photo that fills the frame (under ~8MB).');
          setLoading(false);
          return;
        }
      }

      // 3) Base64 encode compressed JPEG
      const base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // 4) Call AI
      const result = await analyzeReceipt(base64);
      if (!result?.items?.length) {
        Alert.alert(
          'No items found',
          'We couldn’t detect line items. Retake with better lighting and ensure the whole receipt is visible.'
        );
        setLoading(false);
        return;
      }

      const everyone = participants.map(p => p.id);
      const defaultPayer = participants[0]?.id ?? '';

      if (asItemized) {
        // NEW: import as ONE itemized expense (with tip/tax)
        const items = result.items.map((it: any) => ({
          id: `${Math.random()}`,
          description: it.description ?? 'Item',
          amount: Number(it.amount ?? 0),
          splitAmong: everyone, // default to everyone; user can edit later
        }));

        const itemsTotal = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
        const tax = Number(result.tax || 0);
        const tip = Number(result.tip || 0);
        const total = itemsTotal + tax + tip;

        addExpense({
          description: result.merchant || 'Receipt',
          amount: total,
          paidBy: defaultPayer,
          splitAmong: everyone, // fallback (not used in itemized math)
          splitMethod: 'itemized',
          items,
          tax,
          tip,
        });

        Alert.alert('Parsed!', `Imported 1 itemized expense with ${items.length} items.`);
      } else {
        // Legacy: import each line as its own even-split expense
        result.items.forEach((it: any) => {
          addExpense({
            description: it.description ?? 'Item',
            amount: Number(it.amount ?? 0),
            paidBy: it.paidById ?? defaultPayer,
            splitAmong: it.splitAmongIds?.length ? it.splitAmongIds : everyone,
          });
        });
        Alert.alert('Parsed!', `Added ${result.items.length} expense(s).`);
      }
    } catch (err: any) {
      const msg = `${err?.message || err}`;
      const looksNetwork =
        msg.includes('Network') || msg.includes('timeout') || msg.includes('fetch');
      if (looksNetwork) {
        Alert.alert('Network issue', 'Couldn’t reach the AI service. Check your connection and try again.');
      } else {
        Alert.alert('AI error', String(err));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, padding: 16, gap: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: '700' }}>Capture Receipt (AI)</Text>

      {/* Import mode toggle */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Switch value={asItemized} onValueChange={setAsItemized} />
        <Text>
          {asItemized ? 'Import as one itemized expense (with tip/tax)' : 'Import as separate expenses'}
        </Text>
      </View>

      {!photoUri ? (
        <View style={{ gap: 12 }}>
          <Button title="Take Photo" onPress={onTakePhoto} />
          <Button title="Pick From Gallery" onPress={onPickFromGallery} />
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Image source={{ uri: photoUri }} style={{ width: '100%', height: 320, borderRadius: 12 }} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Button title="Retake" onPress={() => setPhotoUri(null)} />
            <Button title="Analyze with AI" onPress={onAnalyze} />
          </View>
        </View>
      )}

      {loading && (
        <View style={{ alignItems: 'center', marginTop: 12 }}>
          <ActivityIndicator />
          <Text>Analyzing…</Text>
        </View>
      )}
    </View>
  );
}
