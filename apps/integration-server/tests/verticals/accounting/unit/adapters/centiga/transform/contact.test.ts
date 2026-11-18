import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformContact,
  type CentigaContact,
} from '../../../../../../../src/verticals/accounting/adapters/centiga/transform/contact'

function makeContact(overrides: Partial<CentigaContact> = {}): CentigaContact {
  return {
    id: 'c-1',
    name: 'Test AS',
    email: 'test@test.no',
    org_nr: '123456789',
    customer: true,
    supplier: false,
    ...overrides,
  }
}

describe('transformContact (Centiga)', () => {
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
    const customer = transformContact(makeContact({ customer: true, supplier: false }))
    expect(customer.isCustomer).toBe(true)
    expect(customer.isSupplier).toBe(false)

    const supplier = transformContact(makeContact({ customer: false, supplier: true }))
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
