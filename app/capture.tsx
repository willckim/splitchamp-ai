// app/capture.tsx
import { useEffect, useState } from 'react';
import { View, Text, Button, Image, ActivityIndicator, Alert, Switch, TouchableOpacity, Modal, TextInput } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { useCameraPermissions } from 'expo-camera';
import { Link } from 'expo-router';
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

  // Control whether server includes Tax/Tip as items
  const [includeTaxTip, setIncludeTaxTip] = useState(true);

  // Helper + details prompts
  const [showHelp, setShowHelp] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // CHANGED: keep as string for inputs, sanitize on change
  const [peopleCount, setPeopleCount] = useState('2');
  const [tipPercent, setTipPercent] = useState('20');

  // OPTIONAL: auto-run analyze after "Continue"
  const AUTO_ANALYZE_AFTER_CONTINUE = false; // flip to true if you want

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
      if (!res.canceled) {
        setPhotoUri(res.assets[0].uri);
        setShowDetails(true); // prompt for people & tip right away
      }
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
      if (!res.canceled) {
        setPhotoUri(res.assets[0].uri);
        setShowDetails(true); // same after picking
      }
    } catch (err) {
      Alert.alert('Picker error', String(err));
    }
  };

  // NEW: normalize + clamp values safely
  const getNormalizedInputs = () => {
    const ppl = Math.max(1, parseInt((peopleCount || '1').replace(/[^0-9]/g, ''), 10) || 1);
    const tip = Math.min(100, Math.max(0, parseInt((tipPercent || '0').replace(/[^0-9]/g, ''), 10) || 0));
    return { ppl, tip };
  };

  // NEW: validate on continue (optionally trigger analyze)
  const onContinueDetails = async () => {
    const { ppl, tip } = getNormalizedInputs();
    // reflect normalized back to fields (in case user typed weird stuff)
    setPeopleCount(String(ppl));
    setTipPercent(String(tip));
    setShowDetails(false);

    if (AUTO_ANALYZE_AFTER_CONTINUE && photoUri) {
      await onAnalyze(); // optional auto-run
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

    // NEW: always use normalized numbers (never NaN)
    const { ppl, tip } = getNormalizedInputs();

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

      // Send as multipart file and pass preferences + people/tip
      const result = await analyzeReceiptFromUri(manipulated.uri, {
        includeTaxTip,
        people: ppl,        // CHANGED: safe numbers
        tipPercent: tip,    // CHANGED: safe numbers
      });

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
        let tipAmt = Number(result.tip || 0);
        if (includeTaxTip && hasTaxItem) tax = 0; // already in items
        if (includeTaxTip && hasTipItem) tipAmt = 0; // already in items

        const total = itemsTotal + tax + tipAmt;

        addExpense({
          description: result.merchant || 'Receipt',
          amount: total,
          paidBy: defaultPayer,
          splitAmong: everyone,
          splitMethod: 'itemized',
          items,
          tax,
          tip: tipAmt,
        });

        const engine = result.engine ? ` (${result.engine})` : '';
        Alert.alert('Parsed!', `Imported 1 itemized expense with ${items.length} items${engine}.`);
      } else {
        // Import each line as its own expense
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
      {/* Top helpers */}
      <Link href="/manual" asChild>
        <TouchableOpacity style={{ position: 'absolute', top: 16, left: 16, padding: 8 }}>
          <Text style={{ color: '#2563EB', fontWeight: '700' }}>Manual entry</Text>
        </TouchableOpacity>
      </Link>

      <TouchableOpacity onPress={() => setShowHelp(true)} style={{ position: 'absolute', top: 16, right: 16, padding: 8 }}>
        <Text style={{ color: '#2563EB', fontWeight: '700' }}>How it works</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 22, fontWeight: '700', color: theme.text, marginTop: 40 }}>Capture Receipt (AI)</Text>

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

      {/* Tip/Tax toggle (controls server behavior) */}
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
          {/* Optional micro-hint */}
          <Text style={{ color: theme.text, opacity: 0.7 }}>
            Pro tip: Fill the frame, avoid glare.
          </Text>
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

      {/* How it works modal */}
      <Modal transparent visible={showHelp} animationType="fade" onRequestClose={() => setShowHelp(false)}>
        <View style={{ flex:1, backgroundColor:"rgba(0,0,0,0.45)", justifyContent:"center", padding:24 }}>
          <View style={{ backgroundColor: theme.card, borderRadius:16, padding:20, gap:10, borderWidth: 1, borderColor: theme.border }}>
            <Text style={{ fontSize:20, fontWeight:"700", color: theme.text }}>How to use SplitChamp AI</Text>
            <Text style={{ color: theme.text }}>1) Snap a clear photo of the entire receipt</Text>
            <Text style={{ color: theme.text }}>2) Enter # of people and tip %</Text>
            <Text style={{ color: theme.text }}>3) We’ll parse the receipt and show who owes who</Text>
            <TouchableOpacity onPress={() => setShowHelp(false)} style={{ alignSelf:"flex-end", padding:8 }}>
              <Text style={{ color:"#2563EB", fontWeight:"700" }}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* People & Tip prompt */}
      <Modal transparent visible={showDetails} animationType="slide" onRequestClose={() => setShowDetails(false)}>
        <View style={{ flex:1, backgroundColor:"rgba(0,0,0,0.45)", justifyContent:"flex-end" }}>
          <View style={{ backgroundColor: theme.card, padding:20, borderTopLeftRadius:20, borderTopRightRadius:20, borderTopWidth: 1, borderColor: theme.border }}>
            <Text style={{ fontSize:18, fontWeight:"700", marginBottom:12, color: theme.text }}>Before we analyze…</Text>

            <View style={{ flexDirection:"row", gap:12 }}>
              <View style={{ flex:1 }}>
                <Text style={{ fontWeight:"600", marginBottom:6, color: theme.text }}>How many people?</Text>
                <TextInput
                  value={peopleCount}
                  onChangeText={(t) => setPeopleCount(t.replace(/[^0-9]/g, ''))}  // CHANGED: sanitize
                  keyboardType="number-pad"
                  style={{ borderWidth:1, borderColor:"#e2e8f0", borderRadius:10, padding:12, color: theme.text }}
                  placeholder="2"
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <View style={{ width:140 }}>
                <Text style={{ fontWeight:"600", marginBottom:6, color: theme.text }}>Tip %</Text>
                <TextInput
                  value={tipPercent}
                  onChangeText={(t) => setTipPercent(t.replace(/[^0-9]/g, ''))} // CHANGED: sanitize
                  keyboardType="number-pad"
                  style={{ borderWidth:1, borderColor:"#e2e8f0", borderRadius:10, padding:12, color: theme.text }}
                  placeholder="20"
                  placeholderTextColor="#94a3b8"
                />
              </View>
            </View>

            <TouchableOpacity
              onPress={onContinueDetails}   // CHANGED: validates + closes (and can auto-run)
              style={{ backgroundColor:"#2563EB", padding:14, borderRadius:12, alignItems:"center", marginTop:16 }}
            >
              <Text style={{ color:"white", fontWeight:"700" }}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
