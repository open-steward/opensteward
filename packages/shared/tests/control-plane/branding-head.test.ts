import { describe, it, expect } from 'vitest'
import { brandingHead, brandingCss } from '../../src/control-plane/branding-head'
import type { HostBranding } from '../../src/control-plane/host-info'

const EMPTY: HostBranding = {
  name: null,
  logoDataUrl: null,
  primaryColor: null,
  secondaryColor: null,
  fontFamily: null,
  fontDataUrl: null,
  fontUrl: null,
  faviconDataUrl: null,
  supportEmail: null,
  privacyPolicyUrl: null,
  termsOfServiceUrl: null,
  baseUrl: null,
}

const host = (over: Partial<HostBranding>): HostBranding => ({ ...EMPTY, ...over })

describe('brandingHead', () => {
  it('emits nothing for empty branding', () => {
    expect(brandingHead(EMPTY)).toBe('')
  })

  it('overrides --accent and --accent-hover from primary/secondary colours', () => {
    const out = brandingHead(host({ primaryColor: '#2D6ADB', secondaryColor: '#1B4FB0' }))
    expect(out).toContain('--accent: #2D6ADB;')
    expect(out).toContain('--accent-hover: #1B4FB0;')
  })

  it('falls back accent-hover to the primary colour when no secondary', () => {
    const out = brandingHead(host({ primaryColor: '#2D6ADB' }))
    expect(out).toContain('--accent-hover: #2D6ADB;')
  })

  it('emits a favicon link with the inferred type', () => {
    const out = brandingHead(host({ faviconDataUrl: 'data:image/png;base64,iVBORw0KGgo=' }))
    expect(out).toContain('rel="icon"')
    expect(out).toContain('type="image/png"')
  })

  it('emits @font-face for an uploaded font and sets --font-sans', () => {
    const out = brandingHead(
      host({ fontFamily: 'Roboto', fontDataUrl: 'data:font/woff2;base64,d09GMg==' }),
    )
    expect(out).toContain('@font-face')
    expect(out).toContain(`format("woff2")`)
    expect(out).toContain('--font-sans: "Roboto"')
  })

  it('prefers an uploaded font over an external stylesheet URL', () => {
    const out = brandingHead(
      host({
        fontFamily: 'Roboto',
        fontDataUrl: 'data:font/woff2;base64,d09GMg==',
        fontUrl: 'https://fonts.googleapis.com/css2?family=Roboto',
      }),
    )
    expect(out).toContain('@font-face')
    expect(out).not.toContain('rel="stylesheet"')
  })

  it('links an external stylesheet when no font file is uploaded', () => {
    const out = brandingHead(
      host({ fontFamily: 'Roboto', fontUrl: 'https://fonts.googleapis.com/css2?family=Roboto' }),
    )
    expect(out).toContain('rel="stylesheet"')
    expect(out).toContain('fonts.googleapis.com')
  })

  it('drops invalid values defensively (bad colour, non-https font URL)', () => {
    const out = brandingHead(host({ primaryColor: 'red', fontUrl: 'http://insecure/font.css' }))
    expect(out).toBe('')
  })
})

describe('brandingCss', () => {
  it('returns raw CSS without <style> wrappers', () => {
    const out = brandingCss(host({ primaryColor: '#2D6ADB' }))
    expect(out).toContain(':root {')
    expect(out).not.toContain('<style>')
  })

  it('pulls an external font in via @import (which must come first)', () => {
    const out = brandingCss(
      host({ fontFamily: 'Roboto', fontUrl: 'https://fonts.googleapis.com/css2?family=Roboto' }),
    )
    expect(out.startsWith('@import url(')).toBe(true)
  })

  it('does not emit favicon CSS (served as a separate route)', () => {
    const out = brandingCss(host({ faviconDataUrl: 'data:image/png;base64,iVBORw0KGgo=' }))
    expect(out).toBe('')
  })
})
