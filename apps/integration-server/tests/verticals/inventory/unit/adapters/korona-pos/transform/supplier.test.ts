import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawKoronaPosSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/korona-pos/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('korona-pos transformSupplier', () => {
  const raw: RawKoronaPosSupplier = {
    id: 'sup-uuid-001',
    number: 'SUP-001',
    name: 'Global Goods Ltd',
    active: true,
    contact: {
      email: 'orders@globalgoods.com',
      phone: '+1-312-555-0123',
      fax: '+1-312-555-0124',
      website: 'https://globalgoods.com',
    },
    address: {
      company: 'Global Goods Ltd',
      address: {
        addressLine1: '200 Lake Shore Dr',
        city: 'Chicago',
        state: 'IL',
        country: 'US',
        zipCode: '60601',
      },
    },
    customerNumber: 'CUST-9001',
    additionalInformation: 'Preferred supplier for beverages',
  }

  it('maps id from raw.id', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('sup-uuid-001')
    expect(result.externalId).toBe('sup-uuid-001')
  })

  it('maps name', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Global Goods Ltd')
  })

  it('maps email from contact.email', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('orders@globalgoods.com')
  })

  it('maps phone from contact.phone', () => {
    const result = transformSupplier(raw)
    expect(result.phone).toBe('+1-312-555-0123')
  })

  it('sets isActive true when active=true', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when active=false', () => {
    const result = transformSupplier({ ...raw, active: false })
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when active is missing', () => {
    const result = transformSupplier({ ...raw, active: undefined })
    expect(result.isActive).toBe(true)
  })

  it('defaultCurrency is undefined (not available in KORONA)', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBeUndefined()
  })

  it('defaultLeadTimeDays is undefined (not available in KORONA)', () => {
    const result = transformSupplier(raw)
    expect(result.defaultLeadTimeDays).toBeUndefined()
  })

  it('sets platform to korona-pos', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('korona-pos')
  })

  it('produces output that satisfies SupplierSchema', () => {
    expect(() => SupplierSchema.parse(transformSupplier(raw))).not.toThrow()
  })
})
