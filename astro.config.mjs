// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// Tailwind is applied via postcss.config.mjs + src/styles/global.css
export default defineConfig({
  output: 'server',
  adapter: vercel()
});
