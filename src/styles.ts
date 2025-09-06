// src/styles.ts
import { StyleSheet } from 'react-native';
import type { Theme } from './lib/theme';

// Create theme-aware styles per screen:
// const { theme } = useTheme();
// const styles = useMemo(() => makeStyles(theme), [theme]);
export const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    // ---------------- base ----------------
    screen: { flex: 1, backgroundColor: theme.bg },
    container: { padding: theme.spacing(4) },
    gap16: { gap: theme.spacing(4) },

    // loading
    loading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.bg,
    },

    // sections
    section: { marginTop: theme.spacing(2) },
    sectionTitle: {
      fontWeight: '800',
      fontSize: 18,
      color: theme.text,
      marginBottom: theme.spacing(1),
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: theme.spacing(1.5),
    },

    // buttons
    primaryBtn: {
      backgroundColor: theme.accent,
      padding: theme.spacing(3),
      borderRadius: theme.radius.md,
      alignItems: 'center',
    },
    disabledBtn: { opacity: 0.5 }, // rely on same bg, lower opacity
    dangerBtn: {
      backgroundColor: '#EF4444',
      paddingHorizontal: theme.spacing(3),
      paddingVertical: theme.spacing(1.5),
      borderRadius: theme.radius.sm,
    },
    btnText: { color: '#fff', fontWeight: '800' },

    calcWrap: { marginTop: theme.spacing(3) },
    helperText: { color: theme.subtext, marginTop: theme.spacing(1) },

    // nav grid/cards
    navGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      marginTop: theme.spacing(3),
      gap: theme.spacing(3),
    },
    navCard: {
      flexGrow: 1,
      backgroundColor: theme.card,
      padding: theme.spacing(4),
      borderRadius: theme.radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
      flexBasis: '48%',
      borderWidth: 1,
      borderColor: theme.border,
      ...theme.shadow.card,
    },
    navCardText: { color: theme.text, fontWeight: '800' },
    dangerBg: { backgroundColor: '#EF4444' },

    // cards
    card: {
      backgroundColor: theme.card,
      borderRadius: theme.radius.lg,
      padding: theme.spacing(3),
      borderWidth: 1,
      borderColor: theme.border,
      ...theme.shadow.card,
    },
    subtleCard: {
      // keep a slightly different look across themes
      backgroundColor:
        theme.name === 'pastel' || theme.name === 'mint'
          ? '#F8FAFC'
          : theme.card,
      borderRadius: theme.radius.lg,
      padding: theme.spacing(3),
      borderWidth: 1,
      borderColor: theme.border,
    },

    // modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing(6),
    },
    modalCard: {
      backgroundColor: theme.card,
      borderRadius: theme.radius.xl,
      padding: theme.spacing(6),
      width: '100%',
      maxWidth: 360,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.border,
      ...theme.shadow.card,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '800',
      marginBottom: theme.spacing(2),
      color: theme.text,
    },
    modalText: {
      fontSize: 16,
      marginBottom: theme.spacing(1.5),
      color: theme.subtext,
    },
    modalBtn: {
      marginTop: theme.spacing(3),
      backgroundColor: theme.accent,
      paddingVertical: theme.spacing(2.5),
      paddingHorizontal: theme.spacing(6),
      borderRadius: theme.radius.md,
    },
    modalBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

    // ---------------- landing / home screen styles ----------------
    landingWrap: {
      padding: 24,
      justifyContent: 'center',
      gap: 12,
    },

    brandCard: {
      alignItems: 'center',
      borderRadius: theme.radius.xl,
      paddingVertical: theme.spacing(6),
      paddingHorizontal: theme.spacing(5),
      borderWidth: 1,
      borderColor: theme.border,
      ...theme.shadow.card,
      marginBottom: theme.spacing(2),
    },
    logoCircle: {
      width: 68,
      height: 68,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: theme.spacing(3),
      backgroundColor: theme.card,
    },
    logoEmoji: { fontSize: 28, color: theme.text },

    brandTitle: { fontSize: 24, fontWeight: '900', color: theme.text },
    brandTag: { fontSize: 15, marginTop: 2, color: theme.subtext },
    brandHint: {
      fontSize: 14,
      textAlign: 'center',
      marginTop: theme.spacing(3),
      lineHeight: 20,
      color: theme.subtext,
    },

    bigBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: theme.spacing(4),
      paddingHorizontal: theme.spacing(4),
      borderRadius: theme.radius.lg,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      ...theme.shadow.card,
    },
    bigBtnEmoji: { fontSize: 20, marginRight: theme.spacing(3), color: theme.text },
    bigBtnTitle: { fontSize: 16, fontWeight: '800', color: theme.text },
    bigBtnSub: { fontSize: 12, marginTop: 2, color: theme.subtext },
    chev: { fontSize: 28, fontWeight: '400', marginLeft: theme.spacing(2), color: theme.subtext },

    footerText: { fontSize: 13, color: theme.subtext, textAlign: 'center' },

    // legacy hero keys
    heroTitle: { fontSize: 28, fontWeight: '900', color: theme.text },
    heroTag: { fontSize: 16, color: theme.subtext },
    heroCardText: { fontSize: 16, color: theme.text, opacity: 0.9 },
    ctaBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: theme.spacing(4),
      paddingHorizontal: theme.spacing(4),
      borderRadius: theme.radius.lg,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      ...theme.shadow.card,
    },
    ctaEmoji: { fontSize: 22, marginRight: theme.spacing(3), color: theme.text },
    ctaText: { fontSize: 17, fontWeight: '800', color: theme.text },
    ctaSub: { fontSize: 13, marginTop: 2, color: theme.subtext },
  });
