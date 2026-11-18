/**
 * The hosted Connect page renders an OAuth adapter's `oauthFields` (Shopify's
 * store) and sends them with the oauth-start request. Before this, the form
 * mount was cleared for every OAuth tile and the OAuth branch posted only
 * `{vertical, platform}` — so there was no way for the customer to say which
 * store they were connecting.
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

describe('Connect page — oauthFields', () => {
  const out = landingHtml({
    token: 'tok',
    host: host(),
    customerEmail: null,
    catalog: [
      {
        vertical: 'ecommerce',
        slug: 'shopify',
        name: 'Shopify',
        authType: 'oauth2',
        oauth: true,
        oauthFields: [
          { name: 'shop', label: 'Shopify store', type: 'text', required: true, placeholder: 'my-store' },
        ],
      },
    ],
  })

  it('ships the fields in the catalog JSON the page renders from', () => {
    expect(out).toContain('"oauthFields":[{"name":"shop"')
  })

  it('renders the form for OAuth tiles, from oauthFields', () => {
    // The renderer picks oauthFields for OAuth tiles and credentialFields otherwise.
    expect(out).toMatch(/selected\.oauth \? selected\.oauthFields : selected\.credentialFields/)
  })

  it('posts the typed fields with the oauth-start request', () => {
    const oauthBranch = out.slice(out.indexOf("'/oauth-start'"), out.indexOf("'/credentials'"))
    expect(oauthBranch).toContain('fields: gatherFields()')
  })

  it('does not hand a half-filled form to the server', () => {
    // A blank required input is caught in the browser before the request is
    // sent; the server still enforces it, this is only the fast path.
    expect(out).toContain("formMount.querySelector('input:invalid')")
  })
})
