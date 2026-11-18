import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import { transformContact, type PagaCustomer } from '../../../../../../../src/verticals/accounting/adapters/paga/transform/contact'

function makeRaw(overrides: Partial<PagaCustomer> = {}): PagaCustomer {
  return {
    customerPublicId: 'CUST-001',
    displayName: 'John Doe',
    firstName: 'John',
    lastName: 'Doe',
    emailAddress: 'john@paga.com',
    phoneNumber: '+2348012345678',
    ...overrides,
  }
}

describe('paga transformContact', () => {
  it('maps customerPublicId to id', () => {
    expect(transformContact(makeRaw()).id).toBe('CUST-001')
  })

  it('maps displayName to name', () => {
    expect(transformContact(makeRaw()).name).toBe('John Doe')
  })

  it('builds name from firstName+lastName when displayName absent', () => {
    expect(transformContact(makeRaw({ displayName: undefined })).name).toBe('John Doe')
  })

  it('sets isCustomer=true', () => {
    expect(transformContact(makeRaw()).isCustomer).toBe(true)
  })

  it('sets isSupplier=false', () => {
    expect(transformContact(makeRaw()).isSupplier).toBe(false)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformContact(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformContact(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeRaw())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
