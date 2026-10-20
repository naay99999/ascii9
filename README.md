# ASCII9

Turn a photo into ASCII art in the browser and download it as PNG, JPG or text. Conversion runs
in a Web Worker on your device; no image is ever uploaded.

Built with Svelte 5, Vite and TypeScript. Runtime dependencies: `svelte` and the Inter and
JetBrains Mono `@fontsource` packages.

## Develop

```sh
npm install
npm run dev      # local dev server
npm test         # unit tests (vitest)
npm run check    # type and Svelte checks
npm run build    # static build into dist/
npm run preview  # serve dist/ locally
```

## Deploy

The build is a static site (`dist/`) with relative asset URLs, so it can be served from any path.

Share cards (Open Graph / Twitter) need absolute image URLs. Set the production origin at build time:

```sh
SITE_URL=https://ascii9.example npm run build
```

This makes `og:image` and `twitter:image` absolute and adds `og:url` and a canonical link. Without
`SITE_URL` those tags stay relative.

On Vercel: import the repo as a static Vite project (build command `npm run build`, output
directory `dist`) and add `SITE_URL` as an environment variable. No server code or `vercel.json`
is needed.

## Sample images

The bundled samples are CC0 or public domain; titles, authors, licences and sources are in
[`public/samples/CREDITS.md`](public/samples/CREDITS.md).
