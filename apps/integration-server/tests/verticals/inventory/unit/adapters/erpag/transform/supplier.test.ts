import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawErpagSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/erpag/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('erpag transformSupplier', () => {
  const raw: RawErpagSupplier = {
    id: 'erpag-sup-001',
    supplier: {
      key: 'sup-key-001',
      supplier: 'Best Supplier',
      eMail: 'orders@best.example',
      taxIdentificationNumber: 'TAX-12345',
      termsOfPayment: 'NET30',
    },
    internationalTrade: false,
    billingAddress: {
      address1: '100 Commerce Blvd',
      address2: 'Suite 5',
      city: 'Austin',
      stateProvince: 'TX',
      zipCode: '78701',
      country: 'US',
    },
  }

  it('maps id and externalId from id field', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('erpag-sup-001')
    expect(result.externalId).toBe('erpag-sup-001')
  })

  it('maps name from supplier.supplier', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Best Supplier')
  })

  it('maps email from supplier.eMail', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('orders@best.example')
  })

  it('sets isActive to true', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('includes metadata with billingCity', () => {
    const result = transformSupplier(raw)
    expect(result.metadata['billingCity']).toBe('Austin')
  })

  it('sets platform to erpag', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('erpag')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
