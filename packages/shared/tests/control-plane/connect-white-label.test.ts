import { describe, it, expect } from 'vitest'
import { errorHtml } from '../../src/control-plane/connect-html'
import type { HostBranding } from '../../src/control-plane/host-info'

function host(overrides: Partial<HostBranding> = {}): HostBranding {
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
    ...overrides,
  }
}

describe('Connect Link white-label attribution', () => {
  const render = (h: HostBranding) =>
    errorHtml({ host: h, status: 410, title: 'Expired', body: 'This link has expired.' })

  it('shows the default OpenSteward mark and wordmark by default', () => {
    const out = render(host())
    expect(out).toContain('aria-label="OpenSteward"')
    expect(out).toContain('<span>OpenSteward</span>')
    expect(out).toContain('<title>410 — OpenSteward</title>')
  })

  it('suppresses the default mark and wordmark under white-label', () => {
    const out = render(host({ hideAttribution: true }))
    expect(out).not.toContain('aria-label="OpenSteward"')
    expect(out).not.toContain('<span>OpenSteward</span>')
    // Page title falls back to a neutral label, never "OpenSteward".
    expect(out).toContain('<title>410 — Connect</title>')
  })

  it('still renders the operator name and logo under white-label', () => {
    const out = render(
      host({ hideAttribution: true, name: 'Acme', logoDataUrl: 'data:image/png;base64,AAAA' }),
    )
    expect(out).toContain('<span>Acme</span>')
    expect(out).toContain('src="data:image/png;base64,AAAA"')
    expect(out).toContain('<title>410 — Acme</title>')
  })
})
