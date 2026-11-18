import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type ExactContact } from '../../../../../../../src/verticals/accounting/adapters/exactonline/transform/contact'

function makeContact(overrides: Partial<ExactContact> = {}): ExactContact {
  return { ID: 'guid-1', Name: 'Test Co', Email: 'test@co.nl', Phone: '+31999', IsCustomer: true, IsBlocked: false, ...overrides }
}

describe('transformContact (exactonline)', () => {
  it('maps id and name', () => {
    const r = transformContact(makeContact())
    expect(r.id).toBe('guid-1')
    expect(r.name).toBe('Test Co')
  })
  it('maps email', () => {
    expect(transformContact(makeContact()).emails?.[0]?.email).toBe('test@co.nl')
  })
  it('maps isCustomer', () => {
    expect(transformContact(makeContact({ IsCustomer: true })).isCustomer).toBe(true)
  })
  it('maps isSupplier', () => {
    expect(transformContact(makeContact({ IsSupplier: true })).isSupplier).toBe(true)
  })
  it('maps billing address', () => {
    const r = transformContact(makeContact({ AddressLine1: 'Main St', City: 'Amsterdam', Country: 'NL' }))
    expect(r.billingAddress?.city).toBe('Amsterdam')
  })
  it('passes raw as metadata', () => {
    const raw = makeContact()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
