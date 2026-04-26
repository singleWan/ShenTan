import type { Metadata } from 'next';
import { Orbitron, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['700', '900'],
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: '神探 - 角色事迹收集系统',
  description: 'AI驱动的角色生平事迹与事件反应可视化',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${orbitron.variable} ${jetbrains.variable}`}>
      <body>
        <div className="bg-grid" />
        <div className="scan-line" />
        {children}
      </body>
    </html>
  );
}
