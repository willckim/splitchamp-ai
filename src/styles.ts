// src/styles.ts
import { StyleSheet } from 'react-native';
import { colors, radius, spacing, shadow } from './ui/theme';

export const styles = StyleSheet.create({
  // layout
  screen: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing(4) },
  gap16: { gap: spacing(4) },

  // loading
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },

  // sections
  section: { marginTop: spacing(2) },
  sectionTitle: { fontWeight: '800', fontSize: 18, color: colors.text, marginBottom: spacing(1) },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing(1.5),
  },

  // buttons
  primaryBtn: {
    backgroundColor: colors.primary, padding: spacing(3), borderRadius: radius.md, alignItems: 'center',
  },
  disabledBtn: { backgroundColor: colors.primaryMuted },
  dangerBtn: {
    backgroundColor: colors.danger, paddingHorizontal: spacing(3), paddingVertical: spacing(1.5), borderRadius: radius.sm,
  },
  btnText: { color: '#fff', fontWeight: '800' },

  calcWrap: { marginTop: spacing(3) },
  helperText: { color: colors.subtext, marginTop: spacing(1) },

  // nav grid/cards
  navGrid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: spacing(3), gap: spacing(3),
  },
  navCard: {
    flexGrow: 1, backgroundColor: colors.card, padding: spacing(4), borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center', flexBasis: '48%',
    borderWidth: 1, borderColor: colors.ring, ...shadow.card,
  },
  navCardText: { color: colors.text, fontWeight: '800' },
  dangerBg: { backgroundColor: colors.danger },

  // cards
  card: {
    backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing(3),
    borderWidth: 1, borderColor: colors.ring, ...shadow.card,
  },
  subtleCard: {
    backgroundColor: '#F8FAFC', borderRadius: radius.lg, padding: spacing(3), borderWidth: 1, borderColor: colors.ring,
  },

  // modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: spacing(6),
  },
  modalCard: {
    backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing(6), width: '100%', maxWidth: 360, alignItems: 'center',
    borderWidth: 1, borderColor: colors.ring, ...shadow.card,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: spacing(2), color: colors.text },
  modalText: { fontSize: 16, marginBottom: spacing(1.5), color: colors.subtext },
  modalBtn: {
    marginTop: spacing(3), backgroundColor: colors.primary, paddingVertical: spacing(2.5), paddingHorizontal: spacing(6), borderRadius: radius.md,
  },
  modalBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
