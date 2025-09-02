// app/capture.tsx
import { useEffect, useState } from 'react';
import { View, Text, Button, Image, ActivityIndicator, Alert, Switch } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { useCameraPermissions } from 'expo-camera';
import { analyzeReceiptFromUri, hasApi } from '@/lib/ai';
import { useSplitStore } from '@/store/useSplitStore';
import { useTheme } from '../src/providers/theme';

export default function CaptureReceipt() {
  const { theme } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Import mode: one itemized expense vs separate expenses
  const [asItemized, setAsItemized] = useState(true);

  // NEW: Control whether server includes Tax/Tip as items
  const [includeTaxTip, setIncludeTaxTip] = useState(true);

  const addExpense = useSplitStore(s => s.addExpense);

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
        quality: 1, // capture full; we’ll compress in-app
        exif: false,
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
        quality: 1,
        exif: false,
      });
      if (!res.canceled) setPhotoUri(res.assets[0].uri);
    } catch (err) {
      Alert.alert('Picker error', String(err));
    }
  };

  const onAnalyze = async () => {
    if (!photoUri) return;

    // No backend? Offer waitlist instead of failing.
    if (!hasApi) {
      const waitlistUrl = (Constants.expoConfig as any)?.extra?.waitlistUrl;
      if (waitlistUrl) {
        Alert.alert(
          'Coming soon',
          'AI receipt parsing requires our cloud service. Join the Pro waitlist to get early access.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Join Waitlist', onPress: () => WebBrowser.openBrowserAsync(waitlistUrl) },
          ]
        );
      } else {
        Alert.alert('Coming soon', 'AI receipt parsing requires our cloud service. This build has it disabled.');
      }
      return;
    }

    const participants = useSplitStore.getState().participants;
    if (participants.length === 0) {
      Alert.alert('Add participants first', 'Please add at least one participant before analyzing.');
      return;
    }

    setLoading(true);
    try {
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

      // Resize + compress -> JPEG (keeps upload fast and predictable)
      const manipulated = await ImageManipulator.manipulateAsync(
        photoUri,
        [{ resize: { width: 1600 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: false }
      );

      const postInfo = await FileSystem.getInfoAsync(manipulated.uri, { size: true });
      if (postInfo.exists && 'size' in postInfo && typeof postInfo.size === 'number') {
        if (postInfo.size > 8 * 1024 * 1024) {
          Alert.alert('Image too large', 'Try a closer photo that fills the frame (under ~8MB).');
          setLoading(false);
          return;
        }
      }

      // Send as multipart file and pass the includeTaxTip preference
      const result = await analyzeReceiptFromUri(manipulated.uri, { includeTaxTip });

      if (!result?.items?.length) {
        Alert.alert(
          'No items found',
          'We couldn’t detect line items. Retake with better lighting and ensure the whole receipt is visible.'
        );
        setLoading(false);
        return;
      }

      const participantsState = useSplitStore.getState().participants;
      const everyone = participantsState.map(p => p.id);
      const defaultPayer = participantsState[0]?.id ?? '';

      if (asItemized) {
        // Build itemized entries
        const items = result.items.map((it: any, idx: number) => ({
          id: `${Date.now()}_${idx}`,
          description: it.description ?? 'Item',
          amount: Number(it.amount ?? 0),
          splitAmong: everyone,
        }));

        // Avoid double-counting: if server already included Tax/Tip as items,
        // don't add top-level tax/tip again.
        const hasTaxItem = result.items.some(
          (it: any) => String(it.description || '').toLowerCase() === 'tax'
        );
        const hasTipItem = result.items.some(
          (it: any) => String(it.description || '').toLowerCase() === 'tip'
        );

        const itemsTotal = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
        let tax = Number(result.tax || 0);
        let tip = Number(result.tip || 0);
        if (includeTaxTip && hasTaxItem) tax = 0; // already in items
        if (includeTaxTip && hasTipItem) tip = 0; // already in items

        const total = itemsTotal + tax + tip;

        addExpense({
          description: result.merchant || 'Receipt',
          amount: total,
          paidBy: defaultPayer,
          splitAmong: everyone,
          splitMethod: 'itemized',
          items,
          tax,
          tip,
        });

        const engine = result.engine ? ` (${result.engine})` : '';
        Alert.alert('Parsed!', `Imported 1 itemized expense with ${items.length} items${engine}.`);
      } else {
        // Import each line as its own expense (less common, but supported)
        result.items.forEach((it: any, idx: number) => {
          addExpense({
            description: it.description ?? `Item ${idx + 1}`,
            amount: Number(it.amount ?? 0),
            paidBy: it.paidById ?? defaultPayer,
            splitAmong: it.splitAmongIds?.length ? it.splitAmongIds : everyone,
          });
        });
        const engine = result.engine ? ` (${result.engine})` : '';
        Alert.alert('Parsed!', `Added ${result.items.length} expense(s)${engine}.`);
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
    <View style={{ flex: 1, padding: 16, gap: 16, backgroundColor: theme.bg }}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: theme.text }}>Capture Receipt (AI)</Text>

      {/* Import mode toggle */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Switch
          value={asItemized}
          onValueChange={setAsItemized}
          trackColor={{ true: theme.accent, false: '#bbb' }}
        />
        <Text style={{ color: theme.text }}>
          {asItemized ? 'Import as one itemized expense' : 'Import as separate expenses'}
        </Text>
      </View>

      {/* NEW: Tip/Tax toggle (controls server query param) */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Switch
          value={includeTaxTip}
          onValueChange={setIncludeTaxTip}
          trackColor={{ true: theme.accent, false: '#bbb' }}
        />
        <Text style={{ color: theme.text }}>
          Split Tip & Tax
        </Text>
      </View>

      {!hasApi && (
        <Text style={{ color: theme.text }}>
          AI parsing is coming soon. Use manual entry or tap Analyze to join the Pro waitlist.
        </Text>
      )}

      {!photoUri ? (
        <View style={{ gap: 12 }}>
          <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: theme.border }}>
            <Button title="Take Photo" onPress={onTakePhoto} color={theme.accent} />
          </View>
          <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: theme.border }}>
            <Button title="Pick From Gallery" onPress={onPickFromGallery} color={theme.accent} />
          </View>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Image source={{ uri: photoUri }} style={{ width: '100%', height: 320, borderRadius: 12 }} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: theme.border }}>
              <Button title="Retake" onPress={() => setPhotoUri(null)} color={theme.accent} />
            </View>
            <View style={{ flex: 1, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: theme.border }}>
              <Button
                title="Analyze with AI"
                onPress={onAnalyze}
                color={theme.accent}
                disabled={loading}
              />
            </View>
          </View>
        </View>
      )}

      {loading && (
        <View style={{ alignItems: 'center', marginTop: 12 }}>
          <ActivityIndicator color={theme.accent} />
          <Text style={{ color: theme.text }}>Analyzing…</Text>
        </View>
      )}
    </View>
  );
}
