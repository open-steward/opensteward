/**
 * The hosted Connect page embeds its bootstrap data into an inline <script>.
 * `preselect` is derived from the link's `allowedPlatforms`, whose slug/vertical
 * are only `z.string().min(1)` at the schema — so a developer with the (default)
 * `connect-links:write` scope can plant a `</script>` breakout, and the page is
 * a credential-entry page for the operator's own customer. `JSON.stringify`
 * alone does not neutralize `</script>`; `jsonForScript` must.
 */
import { describe, it, expect } from 'vitest'
import { landingHtml } from '../../src/control-plane/connect-html'
import type { HostBranding } from '../../src/control-plane/host-info'

function host(): HostBranding {
  return {
    name: null,
    logoDataUrl: null,
    primaryColor: null,
    secondaryColor: null,
    fontFamily: null,
    fontDataUrl: null,
    fontUrl: null,
    faviconDataUrl: null,
    hideAttribution: false,
    supportEmail: null,
    privacyPolicyUrl: null,
    termsOfServiceUrl: null,
    baseUrl: null,
  }
}

const BREAKOUT = '</script><script>window.__xss=1</script>'

describe('Connect page — the operator’s link label stays operator-only', () => {
  it('is not rendered to the customer, because landingHtml is never given it', () => {
    // The label used to be the page's eyebrow, printed above "Connect an
    // account". The admin form that sets it has always said "For your
    // reference only — the customer doesn't see this", and auto-derived labels
    // turned that from merely inaccurate into a leak: they read
    // "<customer> - <tenant> - <adapter> - <minted-at>", so the operator's
    // tenant name and the minute the link was minted became the headline of a
    // page sent to a third party.
    //
    // Pinned by the signature rather than by scanning the output: landingHtml
    // takes no label at all now, so there is nothing for a future edit to
    // print by accident. A `label:` here would not compile.
    const out = landingHtml({
      token: 'tok',
      host: { ...host(), name: 'Acme Ltd' },
      customerEmail: null,
      catalog: [
        { vertical: 'accounting', slug: 'x', name: 'X', authType: 'oauth2', oauth: true },
      ] as never,
    })
    expect(out).toContain('Connect an account')
    // The host still identifies the page — that is what brandHeader is for.
    expect(out).toContain('Acme Ltd')
  })
})

describe('Connect page — inline-script injection is neutralized', () => {
  it('escapes a </script> breakout smuggled through preselect', () => {
    const out = landingHtml({
      token: 'tok',
      host: host(),
      customerEmail: null,
      catalog: [
        { vertical: 'accounting', slug: 'x', name: 'X', authType: 'oauth2', oauth: true },
      ] as never,
      preselect: { vertical: 'accounting', platform: BREAKOUT },
    })
    // The literal closing tag must never appear as raw markup inside the page.
    // (There is exactly one legitimate `</script>` — the bootstrap block's own
    // closing tag — so a smuggled one would show up as a second occurrence of
    // the injected `<script>window.__xss`.)
    expect(out).not.toContain('<script>window.__xss')
    // The payload survives as data, escaped to its \u003c form.
    expect(out).toContain('\\u003c/script\\u003e')
  })

  it('escapes a breakout in the token and catalog too', () => {
    const out = landingHtml({
      token: BREAKOUT,
      host: host(),
      customerEmail: null,
      catalog: [
        { vertical: 'accounting', slug: BREAKOUT, name: BREAKOUT, authType: 'oauth2', oauth: true },
      ] as never,
      preselect: null,
    })
    expect(out).not.toContain('<script>window.__xss')
  })
})
