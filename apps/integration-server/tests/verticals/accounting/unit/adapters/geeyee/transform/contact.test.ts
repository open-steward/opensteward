import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type GeeyeeContact } from '../../../../../../../src/verticals/accounting/adapters/geeyee/transform/contact'

function makeContact(overrides: Partial<GeeyeeContact> = {}): GeeyeeContact {
  return {
    id: 'partner-1',
    name: 'Geeyee Customer Ltd',
    phone: '13800138000',
    email: 'info@geeyee.cn',
    taxNo: '91110000123456789X',
    city: 'Shanghai',
    // Geeyee is a Chinese platform; a real payload plausibly sends the
    // localised country name, not English. This platform's actual locale
    // behaviour is unconfirmed (no accessible API docs), so the fixture
    // documents the safer assumption rather than asserting a resolved
    // code — see the MoySklad adapter for the fuller reasoning.
    country: '中国',
    ...overrides,
  }
}

describe('transformContact (geeyee)', () => {
  it('maps id', () => { expect(transformContact(makeContact()).id).toBe('partner-1') })
  it('maps name', () => { expect(transformContact(makeContact()).name).toBe('Geeyee Customer Ltd') })
  it('maps telephone from phone', () => { expect(transformContact(makeContact()).telephones?.[0]?.telephone).toBe('13800138000') })
  it('maps email', () => { expect(transformContact(makeContact()).emails?.[0]?.email).toBe('info@geeyee.cn') })
  it('maps taxNumber from taxNo', () => { expect(transformContact(makeContact()).taxNumber).toBe('91110000123456789X') })
  it('handles missing taxNo', () => { expect(transformContact(makeContact({ taxNo: undefined })).taxNumber).toBeUndefined() })
  it('cannot resolve the localised (Chinese) country name the platform actually sends', () => {
    // toIso3166Alpha2() has no CJK keys, so this legitimately comes back
    // undefined — nullish is the honest canonical value here, not a wrong
    // guess.
    expect(transformContact(makeContact()).billingAddress?.country).toBeUndefined()
  })
  it('resolves country when the platform sends (or is faked into sending) an English name', () => {
    // toIso3166Alpha2 is still correctly wired up end-to-end; it just has
    // nothing to work with if Geeyee's real data is Chinese-localised.
    expect(transformContact(makeContact({ country: 'China' })).billingAddress?.country).toBe('CN')
  })
  it('metadata identity', () => { const raw = makeContact(); expect(transformContact(raw).metadata).toBe(raw) })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
