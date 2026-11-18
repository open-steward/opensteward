import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type ContaContact,
} from '../../../../../../../src/verticals/accounting/adapters/conta/transform/contact'

function makeContact(overrides: Partial<ContaContact> = {}): ContaContact {
  return {
    id: 'c-1',
    name: 'Test AS',
    email: 'test@test.no',
    org_number: '123456789',
    is_customer: true,
    is_supplier: false,
    ...overrides,
  }
}

describe('transformContact (Conta)', () => {
  it('maps core fields correctly', () => {
    const result = transformContact(makeContact())
    expect(result.id).toBe('c-1')
    expect(result.name).toBe('Test AS')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('sets identification from org number', () => {
    const result = transformContact(makeContact())
    expect(result.identification).toBe('123456789')
  })

  it('sets isCustomer and isSupplier flags', () => {
    const customer = transformContact(makeContact({ is_customer: true, is_supplier: false }))
    expect(customer.isCustomer).toBe(true)
    expect(customer.isSupplier).toBe(false)

    const supplier = transformContact(makeContact({ is_customer: false, is_supplier: true }))
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
