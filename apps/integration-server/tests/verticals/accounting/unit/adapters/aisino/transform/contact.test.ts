import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type AisinoContact } from '../../../../../../../src/verticals/accounting/adapters/aisino/transform/contact'

function makeContact(overrides: Partial<AisinoContact> = {}): AisinoContact {
  return {
    buyerId: 'buyer-1',
    buyerName: 'Aisino Customer Ltd',
    buyerEmail: 'customer@aisino.com',
    buyerPhone: '13800138000',
    taxNo: '91110000123456789X',
    city: 'Beijing',
    // Aisino is a Chinese platform; a real payload plausibly sends the
    // localised country name, not English. This platform's actual locale
    // behaviour is unconfirmed (no accessible API docs), so the fixture
    // documents the safer assumption rather than asserting a resolved
    // code — see the MoySklad adapter for the fuller reasoning.
    country: '中国',
    ...overrides,
  }
}

describe('transformContact (aisino)', () => {
  it('maps id from buyerId', () => { expect(transformContact(makeContact()).id).toBe('buyer-1') })
  it('maps name from buyerName', () => { expect(transformContact(makeContact()).name).toBe('Aisino Customer Ltd') })
  it('maps email from buyerEmail', () => { expect(transformContact(makeContact()).emails?.[0]?.email).toBe('customer@aisino.com') })
  it('maps telephone from buyerPhone', () => { expect(transformContact(makeContact()).telephones?.[0]?.telephone).toBe('13800138000') })
  it('maps taxNumber from taxNo', () => { expect(transformContact(makeContact()).taxNumber).toBe('91110000123456789X') })
  it('handles missing taxNo', () => { expect(transformContact(makeContact({ taxNo: undefined })).taxNumber).toBeUndefined() })
  it('sets emails to undefined when buyerEmail absent', () => { expect(transformContact(makeContact({ buyerEmail: undefined })).emails).toBeUndefined() })
  it('cannot resolve the localised (Chinese) country name the platform actually sends', () => {
    // toIso3166Alpha2() has no CJK keys, so this legitimately comes back
    // undefined — nullish is the honest canonical value here, not a wrong
    // guess.
    expect(transformContact(makeContact()).billingAddress?.country).toBeUndefined()
  })
  it('resolves country when the platform sends (or is faked into sending) an English name', () => {
    // toIso3166Alpha2 is still correctly wired up end-to-end; it just has
    // nothing to work with if Aisino's real data is Chinese-localised.
    expect(transformContact(makeContact({ country: 'China' })).billingAddress?.country).toBe('CN')
  })
  it('metadata identity', () => { const raw = makeContact(); expect(transformContact(raw).metadata).toBe(raw) })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
