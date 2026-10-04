import type { Metadata } from 'next';
import { Providers } from '../shared/providers';
import './globals.css';
export const metadata: Metadata = {
  title: { default: 'PRism — Know the risk before you merge', template: '%s · PRism' },
  description: 'Evidence-first pull request risk analysis and GitHub-native merge governance.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
