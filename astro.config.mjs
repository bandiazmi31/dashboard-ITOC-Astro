// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// Tailwind is applied via postcss.config.mjs + src/styles/global.css
export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone'
  }),
});
