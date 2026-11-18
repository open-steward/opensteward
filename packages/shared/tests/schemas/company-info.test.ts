import { describe, it, expect } from 'vitest'
import { CompanyInfoSchema } from '../../src/schemas/company-info'

describe('CompanyInfoSchema', () => {
  it('accepts an empty object (all fields optional)', () => {
    const result = CompanyInfoSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts a fully populated record', () => {
    const result = CompanyInfoSchema.safeParse({
      name: 'Acme Inc.',
      legalName: 'Acme Holdings B.V.',
      description: 'Selling integrations since 2026',
      website: 'https://acme.example.com',
      logoDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
      primaryColor: '#2D6ADB',
      secondaryColor: '#1B4FB0',
      fontFamily: 'IBM Plex Sans',
      fontDataUrl: 'data:font/woff2;base64,d09GMgABAAAA',
      fontUrl: 'https://fonts.googleapis.com/css2?family=Roboto&display=swap',
      faviconDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      supportEmail: 'support@acme.example.com',
      privacyPolicyUrl: 'https://acme.example.com/privacy',
      termsOfServiceUrl: 'https://acme.example.com/terms',
      addressLine1: '1 Main Street',
      addressLine2: 'Suite 200',
      city: 'Stockholm',
      region: 'Stockholms län',
      postalCode: '11122',
      country: 'SE',
      baseUrl: 'https://oi.acme.example.com',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid website URL', () => {
    const result = CompanyInfoSchema.safeParse({ website: 'not-a-url' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid hex color', () => {
    const result = CompanyInfoSchema.safeParse({ primaryColor: 'blue' })
    expect(result.success).toBe(false)
  })

  it('accepts valid 6-digit hex colors (any case)', () => {
    expect(CompanyInfoSchema.safeParse({ primaryColor: '#abcdef' }).success).toBe(true)
    expect(CompanyInfoSchema.safeParse({ primaryColor: '#ABCDEF' }).success).toBe(true)
  })

  it('rejects 3-digit hex shortcut', () => {
    expect(CompanyInfoSchema.safeParse({ primaryColor: '#abc' }).success).toBe(false)
  })

  it('rejects malformed country code', () => {
    expect(CompanyInfoSchema.safeParse({ country: 'SWE' }).success).toBe(false)
    expect(CompanyInfoSchema.safeParse({ country: 's' }).success).toBe(false)
  })

  it('accepts ISO 3166-1 alpha-2 (any case)', () => {
    expect(CompanyInfoSchema.safeParse({ country: 'SE' }).success).toBe(true)
    expect(CompanyInfoSchema.safeParse({ country: 'us' }).success).toBe(true)
  })

  it('rejects well-formed non-codes by membership, not just shape', () => {
    // 'uk'/'zz' are two letters but neither is an officially assigned
    // ISO 3166-1 alpha-2 code — the UK's real code is 'GB'.
    expect(CompanyInfoSchema.safeParse({ country: 'uk' }).success).toBe(false)
    expect(CompanyInfoSchema.safeParse({ country: 'zz' }).success).toBe(false)
    expect(CompanyInfoSchema.safeParse({ country: 'GB' }).success).toBe(true)
  })

  it('rejects email without @', () => {
    expect(CompanyInfoSchema.safeParse({ supportEmail: 'no-at-sign' }).success).toBe(false)
  })

  it('rejects logo without data: prefix', () => {
    expect(CompanyInfoSchema.safeParse({ logoDataUrl: 'https://example.com/logo.png' }).success).toBe(false)
  })

  it('accepts a PNG data URL', () => {
    expect(
      CompanyInfoSchema.safeParse({ logoDataUrl: 'data:image/png;base64,iVBORw0KGgo=' }).success,
    ).toBe(true)
  })

  it('treats empty strings as valid (lets the form clear fields)', () => {
    const result = CompanyInfoSchema.safeParse({
      website: '',
      primaryColor: '',
      country: '',
      supportEmail: '',
      logoDataUrl: '',
    })
    expect(result.success).toBe(true)
  })

  it('treats null as valid for optional fields', () => {
    const result = CompanyInfoSchema.safeParse({
      website: null,
      primaryColor: null,
      country: null,
    })
    expect(result.success).toBe(true)
  })

  // ── Branding extensions ───────────────────────────────────────────────────

  it('accepts a valid secondary color', () => {
    expect(CompanyInfoSchema.safeParse({ secondaryColor: '#1B4FB0' }).success).toBe(true)
  })

  it('rejects an invalid secondary color', () => {
    expect(CompanyInfoSchema.safeParse({ secondaryColor: 'navy' }).success).toBe(false)
  })

  it('accepts a sane font-family and rejects one with injection characters', () => {
    expect(CompanyInfoSchema.safeParse({ fontFamily: 'IBM Plex Sans' }).success).toBe(true)
    expect(CompanyInfoSchema.safeParse({ fontFamily: 'Roboto"; } body{}' }).success).toBe(false)
  })

  it('requires https for an external font stylesheet URL', () => {
    expect(
      CompanyInfoSchema.safeParse({
        fontUrl: 'https://fonts.googleapis.com/css2?family=Roboto',
      }).success,
    ).toBe(true)
    expect(
      CompanyInfoSchema.safeParse({ fontUrl: 'http://fonts.example.com/font.css' }).success,
    ).toBe(false)
  })

  it('accepts a font data URL and rejects a non-font data URL', () => {
    expect(CompanyInfoSchema.safeParse({ fontDataUrl: 'data:font/woff2;base64,AAAA' }).success).toBe(
      true,
    )
    expect(CompanyInfoSchema.safeParse({ fontDataUrl: 'data:image/png;base64,AAAA' }).success).toBe(
      false,
    )
  })

  it('accepts a favicon that fits under the 256KB cap', () => {
    const payload = 'A'.repeat(150 * 1024) // ~112KB decoded — comfortably under the 256KB cap
    expect(
      CompanyInfoSchema.safeParse({ faviconDataUrl: `data:image/png;base64,${payload}` }).success,
    ).toBe(true)
  })

  it('rejects a favicon over the 256KB cap with a 256KB message', () => {
    const big = 'A'.repeat(256 * 1024 * 2) // ~384KB decoded, over the 256KB cap
    const result = CompanyInfoSchema.safeParse({ faviconDataUrl: `data:image/png;base64,${big}` })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('256KB'))).toBe(true)
    }
  })

  it('accepts a logo that fits under the 512KB cap', () => {
    const payload = 'A'.repeat(300 * 1024) // ~225KB decoded
    expect(
      CompanyInfoSchema.safeParse({ logoDataUrl: `data:image/png;base64,${payload}` }).success,
    ).toBe(true)
  })

  it('rejects a logo over the 512KB cap with a 512KB message', () => {
    const big = 'A'.repeat(512 * 1024 * 2) // ~768KB decoded, over the 512KB cap
    const result = CompanyInfoSchema.safeParse({ logoDataUrl: `data:image/png;base64,${big}` })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes('512KB'))).toBe(true)
    }
  })

  it('rejects an oversized uploaded font', () => {
    const big = 'A'.repeat(512 * 1024 * 2) // ~768KB decoded, over the 512KB cap
    expect(
      CompanyInfoSchema.safeParse({ fontDataUrl: `data:font/woff2;base64,${big}` }).success,
    ).toBe(false)
  })
})
