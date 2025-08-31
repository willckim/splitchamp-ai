// app/legal/privacy.tsx
import MarkdownScreen from './_markdown-screen';
export default function Privacy() {
  return <MarkdownScreen title="Privacy Policy" assetModule={require('../../assets/legal/privacy.md')} />;
}
