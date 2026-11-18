import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type WafeqContact } from '../../../../../../../src/verticals/accounting/adapters/wafeq/transform/contact'

function makeRaw(overrides: Partial<WafeqContact> = {}): WafeqContact {
  return {
    id: 'c1',
    name: 'Acme Corp',
    email: 'info@acme.ae',
    phone: '+971501234567',
    address: {
      street: '123 Main St',
      city: 'Dubai',
      postal_code: '00000',
      country: 'AE',
    },
    tax_number: 'TRN123456',
    type: 'customer',
    ...overrides,
  }
}

describe('transformContact (wafeq)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeRaw())
    expect(result.id).toBe('c1')
    expect(result.name).toBe('Acme Corp')
    expect(result.taxNumber).toBe('TRN123456')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('marks customer type as isCustomer=true and isSupplier=false', () => {
    const result = transformContact(makeRaw({ type: 'customer' }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('marks supplier type as isCustomer=false and isSupplier=true', () => {
    const result = transformContact(makeRaw({ type: 'supplier' }))
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('marks both type as isCustomer=true and isSupplier=true', () => {
    const result = transformContact(makeRaw({ type: 'both' }))
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(true)
  })

  it('maps email into emails array', () => {
    const result = transformContact(makeRaw())
    expect(result.emails).toBeDefined()
    expect(result.emails!.length).toBeGreaterThan(0)
    expect(result.emails![0].email).toBe('info@acme.ae')
  })

  it('maps phone into telephones array', () => {
    const result = transformContact(makeRaw())
    expect(result.telephones).toBeDefined()
    expect(result.telephones!.length).toBeGreaterThan(0)
    expect(result.telephones![0].telephone).toBe('+971501234567')
  })

  it('maps billing address fields', () => {
    const result = transformContact(makeRaw())
    expect(result.billingAddress).toBeDefined()
    expect(result.billingAddress!.city).toBe('Dubai')
    expect(result.billingAddress!.country).toBe('AE')
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformContact({ id: 'c2' })
    expect(result.id).toBe('c2')
    expect(result.name).toBeUndefined()
    expect(result.emails).toBeUndefined()
    expect(result.telephones).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
