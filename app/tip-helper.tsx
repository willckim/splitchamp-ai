// app/tip-helper.tsx
import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, Modal } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/providers/theme';
import { useSplitStore } from '@/store/useSplitStore';

export default function TipHelper() {
  const { theme } = useTheme();

  const setPendingTip   = useSplitStore(s => s.setPendingTip);
  const clearPendingTip = useSplitStore(s => s.clearPendingTip);

  const [subtotal, setSubtotal] = useState('');
  const [tax, setTax] = useState('');
  const [tipPct, setTipPct] = useState('20');
  const [tipFixed, setTipFixed] = useState('');

  const [showResult, setShowResult] = useState(false);
  const [showAskCamera, setShowAskCamera] = useState(false);

  const n = (s: string) => Number((s || '0').replace(/[^0-9.]/g, '')) || 0;

  const calc = useMemo(() => {
    const sub = n(subtotal);
    const tx  = n(tax);
    const tip = tipFixed.length ? n(tipFixed) : sub * (n(tipPct) / 100);
    const total = sub + tx + tip;
    return {
      sub,
      tx,
      tip: Number(tip.toFixed(2)),
      total: Number(total.toFixed(2)),
    };
  }, [subtotal, tax, tipPct, tipFixed]);

  const calculate = () => {
    // Save the computed tip so the capture flow can reconcile it with the parsed receipt.
    setPendingTip(calc.tip);
    setShowResult(true);
    setShowAskCamera(true);
  };

  const openCamera = () => {
    setShowAskCamera(false);
    router.push('/capture');
  };

  const openPro = () => router.push('/pro'); // adjust route if different
  const goHome  = () => router.replace('/');

  const reset = () => {
    setSubtotal('');
    setTax('');
    setTipPct('20');
    setTipFixed('');
    setShowResult(false);
    setShowAskCamera(false);
    clearPendingTip(); // also clear from store
  };

  const PctPill = ({ v }: { v: number }) => (
    <Pressable
      onPress={() => { setTipPct(String(v)); setTipFixed(''); }}
      style={{
        paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999,
        borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, marginRight: 10
      }}
    >
      <Text style={{ color: theme.text, fontWeight: '700' }}>{v}%</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, padding: 16 }}>
      <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800', marginBottom: 10 }}>
        Tip Helper
      </Text>

      <View style={{ backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 14 }}>
        <Text style={{ color: theme.text, fontWeight: '800', marginBottom: 10 }}>Add Tip</Text>

        <TextInput
          value={subtotal}
          onChangeText={t => setSubtotal(t.replace(/[^0-9.]/g,''))}
          placeholder="Subtotal"
          keyboardType="decimal-pad"
          placeholderTextColor="#94a3b8"
          style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 12, color: theme.text, marginBottom: 10 }}
        />

        <TextInput
          value={tax}
          onChangeText={t => setTax(t.replace(/[^0-9.]/g,''))}
          placeholder="Tax (optional)"
          keyboardType="decimal-pad"
          placeholderTextColor="#94a3b8"
          style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 12, color: theme.text, marginBottom: 12 }}
        />

        <View style={{ flexDirection: 'row', marginBottom: 10 }}>
          {[10,15,18,20].map(v => <PctPill key={v} v={v} />)}
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, marginBottom: 6 }}>Tip %</Text>
            <TextInput
              value={tipFixed.length ? '' : tipPct}
              onChangeText={t => { setTipPct(t.replace(/[^0-9.]/g,'')); setTipFixed(''); }}
              placeholder="20"
              keyboardType="decimal-pad"
              placeholderTextColor="#94a3b8"
              style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 12, color: theme.text }}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, marginBottom: 6 }}>Tip $ (optional)</Text>
            <TextInput
              value={tipFixed}
              onChangeText={t => setTipFixed(t.replace(/[^0-9.]/g,''))}
              placeholder="e.g. 8.00"
              keyboardType="decimal-pad"
              placeholderTextColor="#94a3b8"
              style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 12, color: theme.text }}
            />
          </View>
        </View>

        <Pressable
          onPress={calculate}
          style={{ marginTop: 14, height: 48, borderRadius: 12, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ color: '#fff', fontWeight: '800' }}>Calculate</Text>
        </Pressable>
      </View>

      {showResult && (
        <View style={{ marginTop: 14, backgroundColor: theme.card, borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 14, gap: 6 }}>
          <Text style={{ color: theme.text, fontWeight: '800' }}>Result</Text>
          <Text style={{ color: theme.text }}>Tip: ${calc.tip.toFixed(2)}</Text>
          <Text style={{ color: theme.text, fontWeight:'800' }}>Total with tip: ${calc.total.toFixed(2)}</Text>

          {/* primary action */}
          <Pressable
            onPress={openCamera}
            style={{ marginTop: 10, height: 48, borderRadius: 12, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#fff', fontWeight: '800' }}>Use AI (Open Camera)</Text>
          </Pressable>

          {/* secondary row: Pro, Reset, Home */}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <Pressable
              onPress={openPro}
              style={{ flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.card, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: theme.text, fontWeight: '800' }}>Pro Features</Text>
            </Pressable>

            <Pressable
              onPress={reset}
              style={{ flex: 1, height: 44, borderRadius: 12, backgroundColor: '#ef4444', alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>Reset</Text>
            </Pressable>

            <Pressable
              onPress={goHome}
              style={{ flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.bg, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: theme.text, fontWeight: '800' }}>Home</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Modal transparent visible={showAskCamera} animationType="fade" onRequestClose={() => setShowAskCamera(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: theme.card, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: theme.border }}>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800', marginBottom: 8 }}>Calculated</Text>
            <Text style={{ color: theme.text, marginBottom: 6 }}>Tip: ${calc.tip.toFixed(2)}</Text>
            <Text style={{ color: theme.text, fontWeight: '800', marginBottom: 14 }}>Total: ${calc.total.toFixed(2)}</Text>
            <Text style={{ color: theme.text, marginBottom: 12 }}>
              Do you want to open the camera to take a photo of the receipt and split it (even or by item)?
            </Text>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={openCamera}
                style={{ flex: 1, padding: 12, borderRadius: 12, backgroundColor: theme.accent, alignItems: 'center' }}
              >
                <Text style={{ color: '#fff', fontWeight: '800' }}>Yes, open camera</Text>
              </Pressable>

              <Pressable
                onPress={() => setShowAskCamera(false)}
                style={{ flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.bg, alignItems: 'center' }}
              >
                <Text style={{ color: theme.text, fontWeight: '700' }}>No, stay here</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
