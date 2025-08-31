// app/legal/terms.tsx
import MarkdownScreen from './_markdown-screen';
export default function Terms() {
  return <MarkdownScreen title="Terms of Use" assetModule={require('../../assets/legal/terms.md')} />;
}
