import type { Metadata } from 'next';
import { Instrument_Serif, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans-loaded',
  display: 'swap',
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-serif-loaded',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono-loaded',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'GitUnderstand — Visual-First Codebase Intelligence powered by Gemini 4',
  description:
    'Turn any GitHub repository into an interactive spatial architecture atlas, 3D strata stack, calibrated Decision-1 X-Ray, token treemap digest, and Gemini 3.8 Live voice studio. Live at git-understand.com.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://git-understand.com'),
  openGraph: {
    title: 'GitUnderstand — Visual-First Codebase Intelligence Studio',
    description:
      'Unifying Gitingest, GitDiagram, and DeepWiki-Open in a visual-first Gemini 4 multimodal studio.',
    siteName: 'GitUnderstand',
    type: 'website',
  },
};

const COLOR_SCHEME_FOUC_SCRIPT = `try{var v=localStorage.getItem("gitunderstand-color-scheme");var m=document.querySelector('meta[name="color-scheme"]');if(m){m.content=(v==="light"||v==="dark")?v:"light dark";}}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plusJakartaSans.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <meta name="color-scheme" content="light dark" />
        <script dangerouslySetInnerHTML={{ __html: COLOR_SCHEME_FOUC_SCRIPT }} />
      </head>
      <body className="bg-[var(--bg-void)] text-[var(--ink-primary)] font-sans antialiased selection:bg-[var(--cobalt-tint-strong)] selection:text-[var(--ink-primary)]">
        {children}
      </body>
    </html>
  );
}
