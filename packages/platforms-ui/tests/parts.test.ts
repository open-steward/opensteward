/**
 * `renderPlatformsParts()` — the catalogue split into CSS, hero copy, markup
 * and client JS, for a host whose CSP forbids inline `<style>` and `<script>`
 * (the opensteward.dev website serves `styles` and `script` as files).
 *
 * docs-server and the admin keep calling `renderPlatformsBody()`, so its output
 * must stay exactly the parts joined in the order it always had: these tests
 * rebuild it from the parts and require byte equality.
 */
import { describe, expect, it } from 'vitest'
import { renderPlatformsBody, renderPlatformsParts, type PlatformsBodyOpts } from '../src/index.js'

const CASES: Array<[string, PlatformsBodyOpts]> = [
  ['default', {}],
  ['docs-server', { showOverlay: false, apiTagBase: '/unified-api#tag/' }],
  ['admin', { showOverlay: true, configureBasePath: '/platforms', guideHrefBase: 'http://localhost:3003' }],
  ['cdn', { logoSource: 'cdn', brandfetchClientId: 'abc123' }],
]

describe('renderPlatformsParts', () => {
  it.each(CASES)('reassembles into renderPlatformsBody() byte for byte (%s)', (_name, opts) => {
    const { styles, hero, body, script } = renderPlatformsParts(opts)
    const heroBlock =
      '  <div class="providers-hero">\n' +
      `    <div class="eyebrow">${hero.eyebrow}</div>\n` +
      `    <h1>${hero.title}</h1>\n` +
      `    <p>${hero.lead}</p>\n` +
      '  </div>\n'
    const open = '<section class="providers-section">\n'
    expect(body.startsWith(open)).toBe(true)
    const rebuilt =
      `\n<style>${styles}</style>\n` + open + heroBlock + '\n' + body.slice(open.length) + `\n<script>${script}</script>\n`
    expect(renderPlatformsBody(opts)).toBe(rebuilt)
  })

  it('keeps the wrappers and the hero out of the parts', () => {
    const { styles, hero, body, script } = renderPlatformsParts()
    expect(styles).not.toMatch(/<\/?style/)
    expect(script).not.toMatch(/<\/?script/)
    expect(body).not.toMatch(/<style|<script|providers-hero|<h1/)
    expect(hero).toEqual({
      eyebrow: 'Platform Library',
      title: 'Every platform, one schema',
      lead: "Browse every integration OpenSteward normalises into its canonical schema. Click through to the Unified API, the platform's website, or official docs.",
    })
  })

  it('carries every element id the script looks up', () => {
    const { body, script } = renderPlatformsParts()
    for (const id of ['grid', 'empty', 'count', 'q', 'vertical-filters', 'status-filters']) {
      expect(script).toContain(`getElementById('${id}')`)
      expect(body).toContain(`id="${id}"`)
    }
  })

  it('hands out a copy of the hero, so a caller cannot change the next render', () => {
    renderPlatformsParts().hero.title = 'changed'
    expect(renderPlatformsParts().hero.title).toBe('Every platform, one schema')
  })
})
