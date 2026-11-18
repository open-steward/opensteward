import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type YonyouContact } from '../../../../../../../src/verticals/accounting/adapters/yonyou/transform/contact'

function makeContact(overrides: Partial<YonyouContact> = {}): YonyouContact {
  return {
    id: 'cust-10',
    name: 'Test Co Ltd',
    email: 'info@test.cn',
    tel: '13800138000',
    taxno: '91110000123456789X',
    city: 'Shanghai',
    // Yonyou is a Chinese platform; a real payload plausibly sends the
    // localised country name, not English. This platform's actual locale
    // behaviour is unconfirmed (no accessible API docs), so the fixture
    // documents the safer assumption rather than asserting a resolved
    // code — see the MoySklad adapter for the fuller reasoning.
    country: '中国',
    ...overrides,
  }
}

describe('transformContact (yonyou)', () => {
  it('maps id field', () => {
    expect(transformContact(makeContact()).id).toBe('cust-10')
  })

  it('maps name field', () => {
    expect(transformContact(makeContact()).name).toBe('Test Co Ltd')
  })

  it('maps email', () => {
    expect(transformContact(makeContact()).emails![0].email).toBe('info@test.cn')
  })

  it('maps telephone from tel field', () => {
    expect(transformContact(makeContact()).telephones![0].telephone).toBe('13800138000')
  })

  it('maps taxNumber from taxno', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('91110000123456789X')
  })

  it('maps city', () => {
    expect(transformContact(makeContact()).billingAddress?.city).toBe('Shanghai')
  })

  it('cannot resolve the localised (Chinese) country name the platform actually sends', () => {
    // toIso3166Alpha2() has no CJK keys, so this legitimately comes back
    // undefined — nullish is the honest canonical value here, not a wrong
    // guess.
    expect(transformContact(makeContact()).billingAddress?.country).toBeUndefined()
  })

  it('resolves country when the platform sends (or is faked into sending) an English name', () => {
    // toIso3166Alpha2 is still correctly wired up end-to-end; it just has
    // nothing to work with if Yonyou's real data is Chinese-localised.
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
