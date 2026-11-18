/**
 * One platform, one small logo — or, when there is none to load, the
 * brand-tinted monogram the catalog shows in its place.
 *
 * The rules are the catalog's (packages/platforms-ui): the operator's logo
 * source decides between nothing, Brandfetch's CDN and self-hosted files;
 * every image carries its own monogram as the fallback; a brand colour tints
 * the monogram with a luminance-picked foreground; a malformed colour falls
 * back to the vertical's palette. Pinned here so the dashboard's rows and the
 * catalog's tiles cannot drift apart.
 */
import { describe, expect, it } from 'vitest'
import { platformInitials, renderPlatformLogo } from '../../src/core/platform-logo'

const fortnox = {
  slug: 'fortnox',
  name: 'Fortnox',
  vertical: 'accounting',
  primaryColor: '#00B04F',
  domain: 'fortnox.se',
}

describe('platformInitials', () => {
  it('takes the first two letters or digits of the name', () => {
    expect(platformInitials('Fortnox', 'fortnox')).toBe('Fo')
    expect(platformInitials('QuickBooks Online', 'quickbooks')).toBe('Qu')
    expect(platformInitials('e-conomic', 'e-conomic')).toBe('ec')
  })

  it('falls back to the slug when the name has nothing usable', () => {
    expect(platformInitials('…', 'xero')).toBe('XE')
    expect(platformInitials('', 'sage-intacct')).toBe('SA')
  })
})

describe('renderPlatformLogo with no logo source', () => {
  it('renders a monogram tinted with the brand colour, foreground picked for contrast', () => {
    const html = renderPlatformLogo(fortnox, { logoSource: 'none', size: 'xs' })
    expect(html).not.toContain('<img')
    expect(html).toContain('vtile vtile--xs vtile--accounting vtile--brand')
    expect(html).toContain('>Fo</span>')
    // #00B04F is dark enough (relative luminance ≈ 0.32) to take white text.
    expect(html).toContain('background:#00B04F;color:#ffffff;border-color:#00B04F')
  })

  it('picks dark text on a light brand colour', () => {
    const html = renderPlatformLogo({ ...fortnox, primaryColor: '#FFDD00' }, { logoSource: 'none' })
    expect(html).toContain('color:#111827')
  })

  it("uses the vertical's own palette when the brand colour is missing or malformed", () => {
    for (const primaryColor of [undefined, null, 'green', '#12345']) {
      const html = renderPlatformLogo({ ...fortnox, primaryColor }, { logoSource: 'none' })
      expect(html).not.toContain('vtile--brand')
      expect(html).not.toContain('style=')
      expect(html).toContain('vtile--accounting')
    }
  })

  it('is decorative: the name beside it is what a screen reader gets', () => {
    expect(renderPlatformLogo(fortnox, { logoSource: 'none' })).toContain('aria-hidden="true"')
  })
})

describe('renderPlatformLogo with self-hosted logos', () => {
  it('loads the .svg, retries as .png, and carries the monogram as the last resort', () => {
    const html = renderPlatformLogo(fortnox, { logoSource: 'local', size: 'xs' })
    expect(html).toContain('<span class="plogo plogo--xs">')
    expect(html).toContain('src="/data/platforms/logos/fortnox.svg"')
    expect(html).toContain('data-logo-next="/data/platforms/logos/fortnox.png"')
    expect(html).toContain(
      'data-logo-fallback="&lt;span class=&quot;vtile vtile--xs vtile--accounting vtile--brand&quot;',
    )
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('alt=""')
  })

  it('honours a different base path', () => {
    const html = renderPlatformLogo(fortnox, { logoSource: 'local', logoBasePath: '/logos' })
    expect(html).toContain('src="/logos/fortnox.svg"')
  })
})

describe('renderPlatformLogo with the Brandfetch CDN', () => {
  it('hotlinks by domain with the client id, and sends a referrer so Brandfetch answers', () => {
    const html = renderPlatformLogo(fortnox, { logoSource: 'cdn', brandfetchClientId: 'abc123' })
    expect(html).toContain('src="https://cdn.brandfetch.io/fortnox.se/fallback/404/icon?c=abc123"')
    expect(html).toContain('referrerpolicy="strict-origin-when-cross-origin"')
    expect(html).not.toContain('data-logo-next')
  })

  it('falls back to the monogram without a client id, or without a domain', () => {
    expect(renderPlatformLogo(fortnox, { logoSource: 'cdn' })).not.toContain('<img')
    expect(
      renderPlatformLogo(
        { ...fortnox, domain: null },
        { logoSource: 'cdn', brandfetchClientId: 'abc123' },
      ),
    ).not.toContain('<img')
  })
})

describe('renderPlatformLogo escapes what it is given', () => {
  it('never lets a name, slug or colour break out of the markup', () => {
    const html = renderPlatformLogo(
      {
        slug: 'x"y',
        name: '<script>alert(1)</script>',
        vertical: 'crm',
        primaryColor: '#000000" onload="x',
      },
      { logoSource: 'local' },
    )
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('onload=')
    expect(html).toContain('x%22y.svg')
  })
})
