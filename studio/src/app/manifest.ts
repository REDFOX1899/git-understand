import type { MetadataRoute } from 'next';

/**
 * GitUnderstand Web Application Manifest
 * Next.js 15 App Router MetadataRoute.Manifest
 * https://git-understand.com
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'GitUnderstand — Visual-First Codebase Intelligence',
    short_name: 'GitUnderstand',
    description:
      'Turn any GitHub repository into an interactive spatial architecture atlas, 3D strata stack, calibrated Decision-1 X-Ray, token treemap digest, and Gemini 3.8 Live voice studio. Live at git-understand.com.',
    start_url: '/',
    id: 'https://git-understand.com',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#000000',
    theme_color: '#080A0E',
    lang: 'en',
    dir: 'ltr',
    categories: ['developer-tools', 'productivity', 'education'],
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Showcase Blueprints',
        short_name: 'Showcase',
        description: 'Explore curated open-source architectural blueprints and visual atlases',
        url: '/?tab=showcase',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
        ],
      },
      {
        name: 'Gemini 3.8 Live Voice Studio',
        short_name: 'Live Studio',
        description: 'Real-time bidirectional voice walkthrough of codebase architecture',
        url: '/?tab=media',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
        ],
      },
      {
        name: 'Decision-1 X-Ray',
        short_name: 'X-Ray',
        description: 'Calibrated 9-pillar architectural decision and risk heatmap',
        url: '/?tab=xray',
        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
        ],
      },
    ],
    prefer_related_applications: false,
  };
}
