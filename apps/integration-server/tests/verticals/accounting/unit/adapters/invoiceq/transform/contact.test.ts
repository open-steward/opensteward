import { describe, it, expect } from 'vitest'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'
import {
  transformCustomer,
  transformSupplier,
  type InvoiceqCustomer,
  type InvoiceqSupplier,
} from '../../../../../../../src/verticals/accounting/adapters/invoiceq/transform/contact'

function makeCustomer(overrides: Partial<InvoiceqCustomer> = {}): InvoiceqCustomer {
  return {
    id: 'cust1',
    name: 'Doha Business Group',
    email: 'info@dohabiz.qa',
    phone: '+97444123456',
    address: '12 West Bay, Doha',
    tax_number: 'QA999888777',
    contact_type: 'customer',
    ...overrides,
  }
}

function makeSupplier(overrides: Partial<InvoiceqSupplier> = {}): InvoiceqSupplier {
  return {
    id: 'sup1',
    name: 'Qatar Supplies Ltd',
    email: 'supply@qatarsup.qa',
    phone: '+97444987654',
    address: '5 Industrial Area, Doha',
    tax_number: 'QA111222333',
    contact_type: 'supplier',
    ...overrides,
  }
}

describe('transformCustomer (invoiceq)', () => {
  it('maps core fields correctly', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('cust1')
    expect(result.name).toBe('Doha Business Group')
    expect(result.taxNumber).toBe('QA999888777')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('sets isCustomer=true and isSupplier=false', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.isCustomer).toBe(true)
    expect(result.isSupplier).toBe(false)
  })

  it('maps email into emails array', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.emails).toBeDefined()
    expect(result.emails![0].email).toBe('info@dohabiz.qa')
  })

  it('maps phone into telephones array', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.telephones).toBeDefined()
    expect(result.telephones![0].telephone).toBe('+97444123456')
  })

  it('maps billing address', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.billingAddress).toBeDefined()
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformCustomer({ id: 'c2' })
    expect(result.id).toBe('c2')
    expect(result.name).toBeUndefined()
    expect(result.emails).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier (invoiceq)', () => {
  it('maps core fields correctly', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.id).toBe('sup1')
    expect(result.name).toBe('Qatar Supplies Ltd')
    expect(result.taxNumber).toBe('QA111222333')
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeSupplier()
    const result = transformSupplier(raw)
    expect(result.metadata).toBe(raw)
  })

  it('sets isCustomer=false and isSupplier=true', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.isCustomer).toBe(false)
    expect(result.isSupplier).toBe(true)
  })

  it('maps email into emails array', () => {
    const result = transformSupplier(makeSupplier())
    expect(result.emails).toBeDefined()
    expect(result.emails![0].email).toBe('supply@qatarsup.qa')
  })
})
