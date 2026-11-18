/**
 * No inline `style` attributes anywhere in the catalogue's markup.
 *
 * The opensteward.dev website serves the catalogue under `style-src 'self'`,
 * which blocks `style="…"` in parsed HTML. Setting `element.style.*` from
 * script (CSSOM) is allowed. So the monogram's brand colours travel as
 * `data-brand-*` attributes and the script applies them after each render,
 * and again after a failed logo is swapped for its monogram.
 *
 * docs-server and the admin run without a CSP. For them the tiles must look
 * exactly as before: the same three colours on the same elements.
 */
import { describe, expect, it } from 'vitest'
import { renderCatalogue } from './helpers/catalogue-dom.js'
import { renderPlatformsBody, renderPlatformsParts, type PlatformEntry } from '../src/index.js'

const dark: PlatformEntry = { vertical: 'payments', slug: 'stripe', name: 'Stripe', primary_color: '#635BFF', domain: 'stripe.com' }
const light: PlatformEntry = { vertical: 'crm', slug: 'pale', name: 'Pale', primary_color: '#F5F5F0', domain: 'pale.example' }
const plain: PlatformEntry = { vertical: 'crm', slug: 'nutshell', name: 'Nutshell', domain: 'nutshell.com' }
const ALL = [dark, light, plain]

const STYLE_ATTR = /\sstyle\s*=/i

describe('catalogue markup: no inline style attributes', () => {
  it('has none in the static page markup', () => {
    expect(renderPlatformsParts().body).not.toMatch(STYLE_ATTR)
    // The full fragment too, minus the <style> element itself.
    expect(renderPlatformsBody().replace(/<style>[\s\S]*?<\/style>/, '')).not.toMatch(STYLE_ATTR)
  })

  it.each(['none', 'cdn', 'local'] as const)('has none in a rendered grid (%s logos)', async (logoSource) => {
    const { html } = await renderCatalogue(ALL, { logoSource, brandfetchClientId: 'abc123' })
    expect(html).toContain('provider-card')
    // Also covers the escaped monogram inside data-logo-fallback.
    expect(html).not.toMatch(STYLE_ATTR)
    expect(html).not.toContain('style=&quot;')
  })

  it('applies the brand colours through CSSOM after rendering', async () => {
    const { html, tiles } = await renderCatalogue(ALL)
    expect(html).toContain('data-brand-bg="#635BFF"')
    expect(tiles).toEqual([
      { bg: '#635BFF', fg: '#ffffff', style: { background: '#635BFF', color: '#ffffff', borderColor: '#635BFF' } },
      { bg: '#F5F5F0', fg: '#111827', style: { background: '#F5F5F0', color: '#111827', borderColor: '#F5F5F0' } },
    ])
  })

  it('gives an unbranded platform the plain vertical tile, with nothing to apply', async () => {
    const { html, tiles } = await renderCatalogue([plain])
    expect(html).toContain('<span class="vtile vtile--lg vtile--crm">Nu</span>')
    expect(tiles).toEqual([])
  })

  it('styles the monogram that replaces a failed logo, without a style attribute', async () => {
    const page = await renderCatalogue([dark], { logoSource: 'cdn', brandfetchClientId: 'abc123' })
    expect(page.tiles).toEqual([]) // only the <img> so far
    const swap = page.logoError(0)
    expect(swap.replacement).toContain('data-brand-bg="#635BFF"')
    expect(swap.replacement).not.toMatch(STYLE_ATTR)
    expect(swap.parentClasses).toContain('provider-card__logo--fallback')
    expect(swap.tiles).toEqual([
      { bg: '#635BFF', fg: '#ffffff', style: { background: '#635BFF', color: '#ffffff', borderColor: '#635BFF' } },
    ])
  })

  it('tries the .png once before falling back in local mode', async () => {
    const page = await renderCatalogue([dark], { logoSource: 'local', logoBasePath: '/logos' })
    const first = page.logoError(0)
    expect(first.replacement).toBe('')
    expect(first.src).toBe('/logos/stripe.png')
  })

  it('lays out the name column with a class, not an inline style', async () => {
    const { html } = await renderCatalogue([plain])
    expect(html).toContain('<div class="provider-card__ident">')
    expect(renderPlatformsParts().styles).toMatch(/\.provider-card__ident\s*\{\s*min-width:\s*0;\s*flex:\s*1;\s*\}/)
  })
})
