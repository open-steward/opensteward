import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformCustomer,
  transformSupplier,
  type EconomicCustomer,
  type EconomicSupplier,
} from '../../../../../../../src/verticals/accounting/adapters/economic/transform/contact'

function makeCustomer(overrides: Partial<EconomicCustomer> = {}): EconomicCustomer {
  return {
    customerNumber: 1,
    name: 'Customer A',
    corporateIdentificationNumber: 'DK12345678',
    vatNumber: 'DK87654321',
    email: 'a@customer.dk',
    telephoneAndFaxNumber: '12345678',
    mobilePhone: '',
    address: 'Nørreport 1',
    city: 'Copenhagen',
    zip: '1165',
    country: 'DK',
    currency: 'DKK',
    barred: false,
    ...overrides,
  }
}

function makeSupplier(overrides: Partial<EconomicSupplier> = {}): EconomicSupplier {
  return {
    supplierNumber: 2,
    name: 'Supplier B',
    corporateIdentificationNumber: 'DK99999999',
    vatNumber: 'DK11111111',
    email: 'b@supplier.dk',
    phone: '87654321',
    address: 'Vesterbro 5',
    city: 'Copenhagen',
    zip: '1620',
    country: 'DK',
    currency: 'DKK',
    barred: false,
    ...overrides,
  }
}

describe('economic transformCustomer', () => {
  it('maps customerNumber with cust_ prefix', () => {
    expect(transformCustomer(makeCustomer()).id).toBe('cust_1')
  })
  it('handles fields gracefully', () => {
    expect(() => transformCustomer(makeCustomer())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeCustomer()
    expect(transformCustomer(raw).metadata).toBe(raw)
  })
  it('sets isCustomer true and isSupplier false', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })
  it('maps barred to !isActive', () => {
    expect(transformCustomer(makeCustomer({ barred: true })).isActive).toBe(false)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('economic transformSupplier', () => {
  it('maps supplierNumber with supp_ prefix', () => {
    expect(transformSupplier(makeSupplier()).id).toBe('supp_2')
  })
  it('sets isCustomer false and isSupplier true', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeSupplier()
    expect(transformSupplier(raw).metadata).toBe(raw)
  })
})
