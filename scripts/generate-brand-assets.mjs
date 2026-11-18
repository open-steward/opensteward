// Generate raster brand assets from the SVG sources in packages/design-system/logo.
// SVG favicons already cover modern browsers (wired in the app heads); this adds the
// raster fallbacks (PNG/ICO), the PWA icon sizes + web manifest, and the social/OG
// card used for link previews and the GitHub social-preview image.
//
// Run:  npm i -D sharp png-to-ico   (or: npm i --no-save sharp png-to-ico)
//       node scripts/generate-brand-assets.mjs
// Outputs are committed, so this only needs re-running when the marks or brand
// colours change.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const logoDir = join(root, 'packages/design-system/logo')
const iconDir = join(logoDir, 'icons')
const brandDir = join(root, 'brand')
mkdirSync(iconDir, { recursive: true })
mkdirSync(brandDir, { recursive: true })

// Brand palette (packages/design-system/tokens.css).
const PAPER = { r: 0xfa, g: 0xf9, b: 0xf6, alpha: 1 }
const FOREST = '#3D5A33'
const INK = '#17180F'
const MUTED = '#5b5f52'

const markSvg = readFileSync(join(logoDir, 'mark.svg'), 'utf8').replace(/currentColor/g, FOREST)
const wordmarkSvg = readFileSync(join(logoDir, 'wordmark.svg'), 'utf8').replace(/currentColor/g, INK)

// A square icon: the mark, padded, on the paper background (legible on light + dark tab bars).
async function icon(size, pad = 0.18) {
  const inner = Math.round(size * (1 - 2 * pad))
  const mark = await sharp(Buffer.from(markSvg))
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  return sharp({ create: { width: size, height: size, channels: 4, background: PAPER } })
    .composite([{ input: mark, gravity: 'center' }])
    .png()
    .toBuffer()
}

const png = {}
for (const size of [16, 32, 48, 180, 192, 512]) {
  png[size] = await icon(size)
  const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`
  writeFileSync(join(iconDir, name), png[size])
}

// Multi-resolution favicon.ico for legacy clients.
writeFileSync(join(logoDir, 'favicon.ico'), await pngToIco([png[16], png[32], png[48]]))

// PWA manifest.
writeFileSync(
  join(logoDir, 'site.webmanifest'),
  JSON.stringify(
    {
      name: 'OpenSteward',
      short_name: 'OpenSteward',
      icons: [
        { src: '/design/logo/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/design/logo/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      theme_color: FOREST,
      background_color: '#FAF9F6',
      display: 'standalone',
    },
    null,
    2,
  ) + '\n',
)

// Social / OG card (1200×630): wordmark + tagline on paper.
const W = 1200
const H = 630
const wm = await sharp(Buffer.from(wordmarkSvg)).resize({ width: 660 }).png().toBuffer()
const wmMeta = await sharp(wm).metadata()
const tagline = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="60">
     <text x="${W / 2}" y="42" text-anchor="middle"
       font-family="Helvetica, Arial, sans-serif" font-size="30" fill="${MUTED}">
       Your customers’ data, on your servers.</text>
   </svg>`,
)
await sharp({ create: { width: W, height: H, channels: 4, background: PAPER } })
  .composite([
    { input: wm, top: Math.round(H / 2 - (wmMeta.height ?? 120) / 2 - 30), left: Math.round((W - 660) / 2) },
    { input: tagline, top: Math.round(H / 2 + 70), left: 0 },
  ])
  .png()
  .toFile(join(brandDir, 'og.png'))

console.log('brand assets written to packages/design-system/logo/{icons,favicon.ico,site.webmanifest} and brand/og.png')
