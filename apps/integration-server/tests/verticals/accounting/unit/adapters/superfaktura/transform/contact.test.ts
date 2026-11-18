import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type SuperfakturaContact } from '../../../../../../../src/verticals/accounting/adapters/superfaktura/transform/contact'

function makeContact(overrides: Partial<SuperfakturaContact> = {}): SuperfakturaContact {
  return { id: '20', name: 'Novák s.r.o.', email: 'info@novak.sk', phone: '+421900000', city: 'Bratislava', country: 'SK', ico: '12345678', ...overrides }
}

describe('transformContact', () => {
  it('maps id', () => { expect(transformContact(makeContact()).id).toBe('20') })
  it('maps name', () => { expect(transformContact(makeContact()).name).toBe('Novák s.r.o.') })
  it('maps email', () => { expect(transformContact(makeContact()).emails?.[0]?.email).toBe('info@novak.sk') })
  it('maps phone', () => { expect(transformContact(makeContact()).telephones?.[0]?.telephone).toBe('+421900000') })
  it('maps ico to taxNumber', () => { expect(transformContact(makeContact()).taxNumber).toBe('12345678') })
  it('maps city to billingAddress.city', () => { expect(transformContact(makeContact()).billingAddress?.city).toBe('Bratislava') })
  it('metadata identity', () => { const raw = makeContact(); expect(transformContact(raw).metadata).toBe(raw) })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
