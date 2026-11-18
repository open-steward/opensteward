import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type KingdeeContact } from '../../../../../../../src/verticals/accounting/adapters/kingdee/transform/contact'

function makeContact(overrides: Partial<KingdeeContact> = {}): KingdeeContact {
  return {
    custId: 'cust-10',
    custName: 'Test Company',
    email: 'info@test.cn',
    phone: '13800138000',
    taxNo: '91110000123456789X',
    address: 'No.1 Main Street',
    city: 'Beijing',
    // Kingdee is a Chinese platform; a real payload plausibly sends the
    // localised country name, not English. This platform's actual locale
    // behaviour is unconfirmed (no accessible API docs), so the fixture
    // documents the safer assumption rather than asserting a resolved
    // code — see the MoySklad adapter for the fuller reasoning.
    country: '中国',
    ...overrides,
  }
}

describe('transformContact (kingdee)', () => {
  it('maps id from custId', () => {
    expect(transformContact(makeContact()).id).toBe('cust-10')
  })

  it('maps name from custName', () => {
    expect(transformContact(makeContact()).name).toBe('Test Company')
  })

  it('maps email', () => {
    expect(transformContact(makeContact()).emails![0].email).toBe('info@test.cn')
  })

  it('maps taxNumber from taxNo', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('91110000123456789X')
  })

  it('maps city', () => {
    expect(transformContact(makeContact()).billingAddress?.city).toBe('Beijing')
  })

  it('cannot resolve the localised (Chinese) country name the platform actually sends', () => {
    // toIso3166Alpha2() has no CJK keys, so this legitimately comes back
    // undefined — nullish is the honest canonical value here, not a wrong
    // guess.
    expect(transformContact(makeContact()).billingAddress?.country).toBeUndefined()
  })

  it('resolves country when the platform sends (or is faked into sending) an English name', () => {
    // toIso3166Alpha2 is still correctly wired up end-to-end; it just has
    // nothing to work with if Kingdee's real data is Chinese-localised.
    expect(transformContact(makeContact({ country: 'China' })).billingAddress?.country).toBe('CN')
  })

  it('metadata identity', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
