import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mermaid from 'astro-mermaid';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';

import { pullwatchMermaidConfig } from './mermaid.config';

// https://astro.build/config

export default defineConfig({
  site: 'https://dragosdev-code.github.io',

  base: '/pullwatch',

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [
    mermaid({
      theme: 'base',

      autoTheme: true,

      enableLog: false,

      mermaidConfig: pullwatchMermaidConfig,
    }),

    starlight({
      title: 'Pullwatch',

      description:
        'Your GitHub PR inbox. Sorted. No tokens. No noise. Architecture and deep dives.',

      logo: {
        src: './src/assets/logo.png',
      },

      editLink: {
        baseUrl: 'https://github.com/dragosdev-code/pullwatch/edit/main/docs/',
      },

      social: [
        {
          icon: 'github',

          label: 'GitHub',

          href: 'https://github.com/dragosdev-code/pullwatch',
        },
      ],

      components: {
        ThemeSelect: './src/components/DocsThemeSelect.astro',

        Head: './src/components/HeadWithTheme.astro',

        Footer: './src/components/FooterWithDiagrams.astro',
      },

      head: [],

      customCss: [
        './src/styles/global.css',

        './src/styles/starlight-daisy-bridge.css',

        './src/styles/docs-overrides.css',
      ],

      sidebar: [
        {
          label: 'Welcome',

          items: ['index', 'getting-started'],
        },

        {
          label: 'The big picture',

          items: ['architecture/overview'],
        },

        {
          label: 'Deep dives',

          items: [
            'architecture/import-paths-and-aliases',

            'architecture/service-worker-lifecycle',

            'architecture/parser-waterfall',

            {
              label: 'GitHub health and outages',

              items: [
                'architecture/github-health',

                'architecture/github-health/list-trust',

                'architecture/github-health/outage-banner',
              ],
            },

            'architecture/remote-configuration',

            'architecture/data-hydration-and-storage',

            'architecture/popup-and-background-communication',

            'architecture/onboarding-and-session-gates',

            'architecture/notifications-and-sound',

            'architecture/canary-monitor',
          ],
        },

        {
          label: 'Related',

          items: [
            {
              label: 'DOM change runbook',

              link: 'https://github.com/dragosdev-code/pullwatch/blob/main/canary/DOM_CHANGE_RUNBOOK.md',
            },

            {
              label: 'Squash minigame docs',

              link: 'https://github.com/dragosdev-code/pullwatch/tree/main/src/components/squash-minigame/docs',
            },
          ],
        },
      ],
    }),

    react(),

    mdx(),
  ],
});
