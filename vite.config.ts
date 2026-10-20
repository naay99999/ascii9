import { defineConfig, type Plugin } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

/** Share-card crawlers need absolute URLs. When SITE_URL is set at build time (for example
 * `SITE_URL=https://ascii9.example npm run build`), og:image / twitter:image become absolute and
 * og:url plus a canonical link are added. Unset, the page is left as it is (relative URLs). */
function shareUrls(site: string | undefined): Plugin {
  return {
    name: 'ascii9-share-urls',
    transformIndexHtml: {
      order: 'post', // after Vite has rewritten the URLs for `base: './'`
      handler(html) {
        if (!site) return html
        const origin = new URL(site).href // validates and normalises; ends with '/' for a bare origin
        const abs = (u: string) => new URL(u.replace(/^\.?\//, ''), origin).href
        const out = html.replace(
          /(<meta\s+(?:property="og:image"|name="twitter:image")\s+content=")([^"]*)(")/g,
          (_m, a: string, u: string, b: string) => a + abs(u) + b,
        )
        return out.replace(
          /(<meta property="og:type"[^>]*>)/,
          `$1\n    <meta property="og:url" content="${origin}" />\n    <link rel="canonical" href="${origin}" />`,
        )
      },
    },
  }
}

// Read through globalThis: the project has no Node type definitions (and adds no dependency for them).
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}

export default defineConfig({
  plugins: [svelte(), shareUrls(env.SITE_URL || undefined)],
  base: './',
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
})
