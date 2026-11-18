import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type BillingoContact } from '../../../../../../../src/verticals/accounting/adapters/billingo/transform/contact'

function makeContact(overrides: Partial<BillingoContact> = {}): BillingoContact {
  return {
    id: '60',
    name: 'Magyar Kft',
    taxcode: '12345678-1-01',
    email: 'info@magyar.hu',
    ...overrides,
  }
}

describe('transformContact (billingo)', () => {
  it('maps id', () => {
    expect(transformContact(makeContact()).id).toBe('60')
  })

  it('maps name', () => {
    expect(transformContact(makeContact()).name).toBe('Magyar Kft')
  })

  it('maps taxcode to taxNumber', () => {
    expect(transformContact(makeContact()).taxNumber).toBe('12345678-1-01')
  })

  it('maps email', () => {
    const result = transformContact(makeContact())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('info@magyar.hu')
  })

  it('sets isCustomer true', () => {
    expect(transformContact(makeContact()).isCustomer).toBe(true)
  })

  it('sets isSupplier false', () => {
    expect(transformContact(makeContact()).isSupplier).toBe(false)
  })

  it('handles missing email', () => {
    expect(transformContact(makeContact({ email: undefined })).emails).toBeUndefined()
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
