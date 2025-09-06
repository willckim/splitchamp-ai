// app/capture.tsx
import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Button,
  Image,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  Pressable,
  Keyboard,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { useCameraPermissions } from 'expo-camera';
import { Link, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { analyzeReceiptFromUri, hasApi } from '@/lib/ai';
import { useSplitStore } from '@/store/useSplitStore';
import { useTheme } from '@/providers/theme';

function PostAnalyzeSheet({
  visible,
  onClose,
  onSplitEven,
  onSplitByPerson,
  theme,
}: {
  visible: boolean;
  onClose: () => void;
  onSplitEven: () => void;
  onSplitByPerson: () => void;
  theme: any;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: theme.card,
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: insets.bottom + 12, // <-- fills bottom gap
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            borderTopWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800', marginBottom: 8 }}>
            How do you want to split?
          </Text>

          <Pressable
            onPress={onSplitEven}
            style={{ padding: 14, borderRadius: 14, backgroundColor: theme.accent, alignItems: 'center', marginBottom: 10 }}
          >
            <Text style={{ color: '#fff', fontWeight: '800' }}>Split Even</Text>
          </Pressable>

          <Pressable
            onPress={onSplitByPerson}
            style={{
              padding: 14,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: theme.bg,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: theme.text, fontWeight: '700' }}>Split by Item</Text>
          </Pressable>

          <Pressable onPress={onClose} style={{ marginTop: 10, alignItems: 'center', padding: 10 }}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontWeight: '700' }}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function CaptureReceipt() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [permission, requestPermission] = useCameraPermissions();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Helper + details prompts
  const [showHelp, setShowHelp] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Post-analyze split choice
  const [showSplitChoice, setShowSplitChoice] = useState(false);

  // Name editor modal
  const [showNameModal, setShowNameModal] = useState(false);
  const [namesDraft, setNamesDraft] = useState<string[]>([]);

  // Only track number of people now
  const [peopleCount, setPeopleCount] = useState('2');

  // keyboard awareness (so the UI can adapt if needed later)
  const [kbVisible, setKbVisible] = useState(false);
  const [kbHeight, setKbHeight] = useState(0);

  const AUTO_ANALYZE_AFTER_CONTINUE = false;

  // Store actions (replace expenses instead of appending)
  const setExpenses = useSplitStore((s) => s.setExpenses);
  const upsertParticipantNames = useSplitStore((s) => s.upsertParticipantNames);
  const applyEqualSplit = useSplitStore((s) => s.applyEqualSplit);
  const createParticipantsByCount = useSplitStore.getState().createParticipantsByCount;

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  // keyboard listeners
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const sh = Keyboard.addListener(showEvt, (e) => {
      setKbVisible(true);
      setKbHeight(e.endCoordinates?.height ?? 0);
    });
    const hd = Keyboard.addListener(hideEvt, () => {
      setKbVisible(false);
      setKbHeight(0);
    });
    return () => {
      sh.remove();
      hd.remove();
    };
  }, []);

  const onTakePhoto = async () => {
    try {
      const camPerm = await requestPermission();
      if (!camPerm.granted) {
        Alert.alert('Permission needed', 'Enable camera in system Settings to scan receipts.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 1, exif: false });
      if (!res.canceled) {
        setPhotoUri(res.assets[0].uri);
        setShowDetails(true);
      }
    } catch (err) {
      Alert.alert('Camera error', String(err));
    }
  };

  const onPickFromGallery = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ allowsMultipleSelection: false, quality: 1, exif: false });
      if (!res.canceled) {
        setPhotoUri(res.assets[0].uri);
        setShowDetails(true);
      }
    } catch (err) {
      Alert.alert('Picker error', String(err));
    }
  };

  // Normalize people count
  const getPeople = () => Math.max(1, parseInt((peopleCount || '1').replace(/[^0-9]/g, ''), 10) || 1);

  const defaultNamesFor = (count: number) => {
    const existing = useSplitStore.getState().participants;
    const base = existing.length ? existing.map((p) => p.name || '') : [];
    const out: string[] = [];
    for (let i = 0; i < count; i++) out.push(base[i] || `Person ${i + 1}`);
    return out;
  };

  const onContinueDetails = async () => {
    const ppl = getPeople();
    setPeopleCount(String(ppl));

    const { participants } = useSplitStore.getState();
    if (participants.length !== ppl) {
      createParticipantsByCount?.(ppl);
    }

    setNamesDraft(defaultNamesFor(ppl));
    setShowDetails(false);
    setShowNameModal(true);

    if (AUTO_ANALYZE_AFTER_CONTINUE && photoUri) {
      // could auto-run after naming if desired
    }
  };

  const onSaveNames = (doAnalyzeAfter?: boolean) => {
    const trimmed = namesDraft.map((n) => n.trim()).map((n, i) => (n.length ? n : `Person ${i + 1}`));
    upsertParticipantNames?.(trimmed);
    setShowNameModal(false);
    if (doAnalyzeAfter && photoUri) onAnalyze();
  };

  const onAnalyze = async () => {
    if (!photoUri) return;

    if (!hasApi) {
      const waitlistUrl = (Constants.expoConfig as any)?.extra?.waitlistUrl;
      if (waitlistUrl) {
        Alert.alert('Coming soon', 'AI receipt parsing requires our cloud service. Join the Pro waitlist to get early access.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Join Waitlist', onPress: () => WebBrowser.openBrowserAsync(waitlistUrl) },
        ]);
      } else {
        Alert.alert('Coming soon', 'AI receipt parsing requires our cloud service. This build has it disabled.');
      }
      return;
    }

    const ppl = getPeople();
    const state = useSplitStore.getState();
    if (state.participants.length === 0) {
      state.createParticipantsByCount?.(ppl);
      setNamesDraft(defaultNamesFor(ppl));
    }

    setLoading(true);
    try {
      const info = await FileSystem.getInfoAsync(photoUri, { size: true });
      if (!info.exists || ('isDirectory' in info && (info as any).isDirectory)) {
        Alert.alert('Invalid image', 'Please retake the photo.');
        setLoading(false);
        return;
      }

      const manipulated = await ImageManipulator.manipulateAsync(
        photoUri,
        [{ resize: { width: 1600 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: false }
      );

      const postInfo = await FileSystem.getInfoAsync(manipulated.uri, { size: true });
      if (postInfo.exists && 'size' in postInfo && typeof (postInfo as any).size === 'number' && (postInfo as any).size > 8 * 1024 * 1024) {
        Alert.alert('Image too large', 'Try a closer photo that fills the frame (under ~8MB).');
        setLoading(false);
        return;
      }

      // No tipPercent sent anymore
      const result = await analyzeReceiptFromUri(manipulated.uri, { people: ppl });

      if (!result?.items?.length) {
        Alert.alert('No items found', 'Retake with better lighting and ensure the whole receipt is visible.');
        setLoading(false);
        return;
      }

      const participantsState = useSplitStore.getState().participants;
      const everyone = participantsState.map((p) => p.id);
      const defaultPayer = participantsState[0]?.id ?? '';

      // Always import as one itemized expense; start items unassigned
      const hasTaxItem = result.items.some((it: any) => String(it.description || '').toLowerCase() === 'tax');
      const hasTipItem = result.items.some((it: any) => String(it.description || '').toLowerCase() === 'tip');

      const items = result.items.map((it: any, idx: number) => ({
        id: it.id || `it_${Date.now()}_${idx}`,
        description: it.description ?? `Item ${idx + 1}`,
        amount: Number(it.amount ?? 0),
        splitAmong: [],
      }));

      const itemsTotal = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
      let tax = Number(result.tax || 0);
      let tipAmt = Number(result.tip || 0);
      if (hasTaxItem) tax = 0;
      if (hasTipItem) tipAmt = 0;

      const total = itemsTotal + tax + tipAmt;

      setExpenses(
        [
          {
            description: result.merchant || 'Receipt',
            amount: total,
            paidBy: defaultPayer,
            splitAmong: everyone,
            splitMethod: 'itemized',
            items,
            tax,
            tip: tipAmt,
          },
        ],
        { overwrite: true, assignToAllIfEmpty: false }
      );

      setShowSplitChoice(true);
      setPhotoUri(null);
    } catch (err: any) {
      const msg = `${err?.message || err}`;
      const looksNetwork = msg.includes('Network') || msg.includes('timeout') || msg.includes('fetch');
      if (looksNetwork) {
        Alert.alert('Network issue', 'Couldn’t reach the AI service. Check your connection and try again.');
      } else {
        Alert.alert('AI error', String(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSplitEven = () => {
    applyEqualSplit?.();
    setShowSplitChoice(false);
    router.replace('/summary');
  };

  const handleSplitByPerson = () => {
    setShowSplitChoice(false);
    router.push('/split/assign');
  };

  return (
    <View style={{ flex: 1, padding: 16, gap: 16, backgroundColor: theme.bg }}>
      {/* Top helpers */}
      <Link href="/tip-helper" asChild>
        <TouchableOpacity style={{ position: 'absolute', top: 16, left: 16, padding: 8 }}>
          <Text style={{ color: '#2563EB', fontWeight: '700' }}>Tip Helper</Text>
        </TouchableOpacity>
      </Link>

      <TouchableOpacity onPress={() => setShowHelp(true)} style={{ position: 'absolute', top: 16, right: 16, padding: 8 }}>
        <Text style={{ color: '#2563EB', fontWeight: '700' }}>How it works</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 22, fontWeight: '700', color: theme.text, marginTop: 40 }}>Capture Receipt (AI)</Text>

      {!hasApi && (
        <Text style={{ color: theme.text }}>
          AI parsing is coming soon. Use Tip Helper or tap Analyze to join the Pro waitlist.
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
          <Text style={{ color: theme.text, opacity: 0.7 }}>Pro tip: Fill the frame, avoid glare.</Text>
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Image source={{ uri: photoUri }} style={{ width: '100%', height: 320, borderRadius: 12 }} />
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: theme.border }}>
              <Button title="Retake" onPress={() => setPhotoUri(null)} color={theme.accent} />
            </View>
            <View style={{ flex: 1, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: theme.border }}>
              <Button title="Analyze with AI" onPress={onAnalyze} color={theme.accent} disabled={loading} />
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
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: 16,
              padding: 20,
              gap: 10,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <Text style={{ fontSize: 20, fontWeight: '700', color: theme.text }}>How to use SplitChamp AI</Text>
            <Text style={{ color: theme.text }}>1) Snap a clear photo of the entire receipt</Text>
            <Text style={{ color: theme.text }}>2) Enter # of people</Text>
            <Text style={{ color: theme.text }}>3) We’ll parse the receipt and show who owes who</Text>
            <TouchableOpacity onPress={() => setShowHelp(false)} style={{ alignSelf: 'flex-end', padding: 8 }}>
              <Text style={{ color: '#2563EB', fontWeight: '700' }}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* People prompt (tip removed) */}
      <Modal transparent visible={showDetails} animationType="slide" onRequestClose={() => setShowDetails(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: theme.card,
              paddingHorizontal: 20,
              paddingTop: 20,
              paddingBottom: insets.bottom + 12, // <-- fills bottom gap
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              borderTopWidth: 1,
              borderColor: theme.border,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 12, color: theme.text }}>
              Before we analyze…
            </Text>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600', marginBottom: 6, color: theme.text }}>How many people?</Text>
                <TextInput
                  value={peopleCount}
                  onChangeText={(t) => setPeopleCount(t.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, color: theme.text }}
                  placeholder="2"
                  placeholderTextColor="#94a3b8"
                />
              </View>
            </View>

            <TouchableOpacity
              onPress={onContinueDetails}
              style={{ backgroundColor: '#2563EB', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 16 }}
            >
              <Text style={{ color: 'white', fontWeight: '700' }}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Name participants modal */}
      <Modal transparent visible={showNameModal} animationType="slide" onRequestClose={() => setShowNameModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View
            style={{
              backgroundColor: theme.card,
              paddingHorizontal: 20,
              paddingTop: 20,
              paddingBottom: (kbVisible ? kbHeight : 0) + insets.bottom + 12, // <-- safe area + keyboard lift
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              borderTopWidth: 1,
              borderColor: theme.border,
              maxHeight: '80%',
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 12, color: theme.text }}>Name the participants</Text>

            <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
              {namesDraft.map((n, i) => (
                <View key={i} style={{ marginBottom: 10 }}>
                  <Text style={{ color: theme.text, marginBottom: 6 }}>Person {i + 1}</Text>
                  <TextInput
                    value={n}
                    onChangeText={(t) => {
                      const copy = [...namesDraft];
                      copy[i] = t;
                      setNamesDraft(copy);
                    }}
                    placeholder={`Person ${i + 1}`}
                    placeholderTextColor="#94a3b8"
                    style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12, color: theme.text }}
                  />
                </View>
              ))}
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              <TouchableOpacity
                onPress={() => setShowNameModal(false)}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: 12,
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: theme.border,
                  backgroundColor: theme.bg,
                }}
              >
                <Text style={{ color: theme.text, fontWeight: '700' }}>Skip</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => onSaveNames(false)}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: 12,
                  alignItems: 'center',
                  backgroundColor: theme.card,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Text style={{ color: theme.text, fontWeight: '700' }}>Save Names</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => onSaveNames(true)}
                style={{ flex: 1, padding: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#2563EB' }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Save & Analyze</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Post-analyze split choice */}
      <PostAnalyzeSheet
        visible={showSplitChoice}
        onClose={() => setShowSplitChoice(false)}
        onSplitEven={handleSplitEven}
        onSplitByPerson={handleSplitByPerson}
        theme={theme}
      />
    </View>
  );
}
