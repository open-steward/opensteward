import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type UnimicroContact,
} from '../../../../../../../src/verticals/accounting/adapters/unimicro/transform/contact'

function makeContact(overrides: Partial<UnimicroContact> = {}): UnimicroContact {
  return {
    ID: 1,
    Info: {
      Name: 'Test AS',
      DefaultEmail: { EmailAddress: 'test@test.no' },
      Phones: [{ Number: '12345678' }],
      Addresses: [
        {
          AddressLine1: 'Storgata 1',
          City: 'Oslo',
          PostalCode: '0101',
          Country: 'NO',
        },
      ],
    },
    OrgNumber: '123456789',
    IsCustomer: true,
    IsSupplier: false,
    ...overrides,
  }
}

describe('transformContact (Unimicro)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('1')
    expect(result.name).toBe('Test AS')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('sets identification from org number', () => {
    const result = transformContact(makeContact())
    expect(result.identification).toBe('123456789')
  })

  it('sets isCustomer and isSupplier flags', () => {
    const customer = transformContact(makeContact({ IsCustomer: true, IsSupplier: false }))
    expect(customer.isCustomer).toBe(true)
    expect(customer.isSupplier).toBe(false)

    const supplier = transformContact(makeContact({ IsCustomer: false, IsSupplier: true }))
    expect(supplier.isCustomer).toBe(false)
    expect(supplier.isSupplier).toBe(true)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeContact()
    const result = transformContact(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformContact(makeContact())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
