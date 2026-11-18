import { describe, it, expect, afterEach } from 'vitest'
import { renderHeader, setNavBrand } from '../../src/header.js'

describe('renderHeader operator branding', () => {
  afterEach(() => {
    // Reset the module-global brand so tests don't leak into each other.
    setNavBrand({ name: null, logoDataUrl: null })
  })

  it('defaults to the OpenSteward mark and name', () => {
    const out = renderHeader()
    expect(out).toContain('class="oi-nav__mark"')
    expect(out).toContain('<span>OpenSteward</span>')
    expect(out).not.toContain('oi-nav__logo')
  })

  it('renders the operator name when set', () => {
    setNavBrand({ name: 'Acme Inc.', logoDataUrl: null })
    const out = renderHeader()
    expect(out).toContain('<span>Acme Inc.</span>')
    // No logo → still the default mark.
    expect(out).toContain('class="oi-nav__mark"')
  })

  it('renders the operator logo as an <img> when a valid data URL is set', () => {
    setNavBrand({ name: 'Acme', logoDataUrl: 'data:image/png;base64,iVBORw0KGgo=' })
    const out = renderHeader()
    expect(out).toContain('class="oi-nav__logo"')
    expect(out).toContain('src="data:image/png;base64,iVBORw0KGgo="')
    expect(out).not.toContain('class="oi-nav__mark"')
  })

  it('ignores a non-image logo value defensively', () => {
    setNavBrand({ name: 'Acme', logoDataUrl: 'javascript:alert(1)' })
    const out = renderHeader()
    expect(out).not.toContain('oi-nav__logo')
    expect(out).toContain('class="oi-nav__mark"')
  })

  it('escapes the operator name', () => {
    setNavBrand({ name: '<script>x</script>', logoDataUrl: null })
    const out = renderHeader()
    expect(out).not.toContain('<script>x</script>')
    expect(out).toContain('&lt;script&gt;')
  })

  it('suppresses the default mark and wordmark under white-label', () => {
    setNavBrand({ name: null, logoDataUrl: null, hideAttribution: true })
    const out = renderHeader()
    expect(out).not.toContain('class="oi-nav__mark"')
    expect(out).not.toContain('<span>OpenSteward</span>')
    // The home link stays accessible without leaking the product name.
    expect(out).toContain('aria-label="Home"')
  })

  it('still renders an operator name under white-label', () => {
    setNavBrand({ name: 'Acme', logoDataUrl: null, hideAttribution: true })
    const out = renderHeader()
    expect(out).toContain('<span>Acme</span>')
    // Default OpenSteward glyph stays suppressed even with a name set.
    expect(out).not.toContain('class="oi-nav__mark"')
  })

  it('still renders an operator logo under white-label', () => {
    setNavBrand({ name: 'Acme', logoDataUrl: 'data:image/png;base64,iVBORw0KGgo=', hideAttribution: true })
    const out = renderHeader()
    expect(out).toContain('class="oi-nav__logo"')
  })
})

describe('renderHeader mobile menu', () => {
  /**
   * Below 880px the inline links are hidden by CSS. Before this menu existed
   * they were hidden with no replacement, and every link without
   * `keepOnMobile` became unreachable on a phone — which in practice meant the
   * whole nav except the Unified API link. These assert the disclosure carries the
   * full set, so hiding the inline group can never again mean losing
   * navigation.
   */
  const SHARED_DESTINATIONS = [
    '/guides',
    '/platforms',
    '/postman',
    '/unified-api',
    '/operator-api',
    'https://github.com/open-steward/opensteward',
  ]

  /** The panel's markup, which is what a sub-880px viewport actually shows. */
  function panelOf(html: string): string {
    const m = /<div class="oi-nav__menu-panel">([\s\S]*?)<\/div>/.exec(html)
    return m?.[1] ?? ''
  }

  it('renders a disclosure holding every shared destination', () => {
    const panel = panelOf(renderHeader())
    for (const href of SHARED_DESTINATIONS) {
      expect(panel).toContain(`href="${href}"`)
    }
  })

  it('reaches the same destinations inline and in the menu', () => {
    // A link present in only one of the two is reachable at only one width,
    // which is the defect this replaced.
    const html = renderHeader()
    const panel = panelOf(html)
    const inlineOnly = SHARED_DESTINATIONS.filter((h) => !panel.includes(`href="${h}"`))
    expect(inlineOnly).toEqual([])
  })

  it('carries page-local anchor links into the menu too', () => {
    // On /unified-api these are the openapi.json / openapi.yaml downloads;
    // on the landing page they are the section anchors. Both were unreachable
    // on mobile before.
    const panel = panelOf(
      renderHeader({
        anchorLinks: [
          { href: '/openapi.json', label: 'openapi.json', className: 'mono' },
          { href: '#verticals', label: 'Verticals' },
        ],
      }),
    )
    expect(panel).toContain('href="/openapi.json"')
    expect(panel).toContain('href="#verticals"')
    // The caller's styling survives the trip into the panel.
    expect(panel).toContain('class="mono"')
  })

  it('divides page-local anchors from the shared links, and only when present', () => {
    expect(panelOf(renderHeader({ anchorLinks: [{ href: '#a', label: 'A' }] }))).toContain('<hr>')
    expect(panelOf(renderHeader())).not.toContain('<hr>')
  })

  it('offers no way to mark a link inline-only', () => {
    // The old escape hatch. Its absence is the guarantee: there is no longer a
    // flag that hides a link on mobile without putting it in the menu.
    const html = renderHeader({ anchorLinks: [{ href: '#a', label: 'A' }] })
    expect(html).not.toContain('data-keep-on-mobile')
  })
})
