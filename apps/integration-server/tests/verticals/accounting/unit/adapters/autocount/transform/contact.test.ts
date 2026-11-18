import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformDebtor,
  transformCreditor,
  type AutocountDebtor,
  type AutocountCreditor,
} from '../../../../../../../src/verticals/accounting/adapters/autocount/transform/contact'

function makeDebtor(overrides: Partial<AutocountDebtor> = {}): AutocountDebtor {
  return {
    DebtorCode: 'D001',
    CompanyName: 'Acme Sdn Bhd',
    Email: 'billing@acme.my',
    Phone: '+60312345678',
    Fax: '+60387654321',
    Address1: '123 Jalan Ampang',
    Address2: 'Suite 10',
    Address3: '',
    AreaCode: 'Kuala Lumpur',
    PostCode: '50450',
    CountryCode: 'MY',
    CurrencyCode: 'MYR',
    IsActive: true,
    GSTRegistrationNo: '001234567890',
    ...overrides,
  }
}

function makeCreditor(overrides: Partial<AutocountCreditor> = {}): AutocountCreditor {
  return {
    CreditorCode: 'CR001',
    CompanyName: 'Supplier Bhd',
    Email: 'ap@supplier.my',
    Phone: '+60312341234',
    Address1: '456 Jalan Chow Kit',
    Address2: '',
    PostCode: '50100',
    CountryCode: 'MY',
    CurrencyCode: 'MYR',
    IsActive: true,
    ...overrides,
  }
}

describe('transformDebtor (autocount)', () => {
  it('maps core fields correctly', () => {
    const result = transformDebtor(makeDebtor())
    expect(result.id).toBe('debtor_D001')
    expect(result.name).toBe('Acme Sdn Bhd')
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
    expect(result.isActive).toBe(true)
    expect(result.currency).toBe('MYR')
    expect(result.taxNumber).toBe('001234567890')
  })

  it('maps email to WORK type', () => {
    const result = transformDebtor(makeDebtor())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('billing@acme.my')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone and fax', () => {
    const result = transformDebtor(makeDebtor())
    expect(result.telephones).toHaveLength(2)
    expect(result.telephones![0].type).toBe('WORK')
    expect(result.telephones![1].type).toBe('FAX')
  })

  it('maps billing address fields', () => {
    const result = transformDebtor(makeDebtor())
    expect(result.billingAddress?.address1).toBe('123 Jalan Ampang')
    expect(result.billingAddress?.city).toBe('Kuala Lumpur')
    expect(result.billingAddress?.postalCode).toBe('50450')
    expect(result.billingAddress?.country).toBe('MY')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeDebtor()
    const result = transformDebtor(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformDebtor(makeDebtor())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('transformCreditor (autocount)', () => {
  it('maps core fields correctly', () => {
    const result = transformCreditor(makeCreditor())
    expect(result.id).toBe('creditor_CR001')
    expect(result.name).toBe('Supplier Bhd')
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
    expect(result.isActive).toBe(true)
    expect(result.currency).toBe('MYR')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeCreditor()
    const result = transformCreditor(raw)
    expect(result.metadata).toBe(raw)
  })
})
