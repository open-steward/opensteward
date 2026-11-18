/**
 * Fixture from the Supplier example selection and "Available fields" of
 * https://erplain.readme.io/v2.0/reference/suppliers-queries; Currency.label
 * is "Name of the currency (USD, GBP, ...)" (/v2.0/reference/currencies-queries).
 */
import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawErplainSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/erplain/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

const raw: RawErplainSupplier = {
  id: 3001,
  label: 'Acme Suppliers',
  email: 'orders@acme.example',
  phone: '+33 1 00 00 00 00',
  active: true,
  supplier_number: 'SUP-3001',
  currency: { label: 'EUR' },
}

describe('erplain transformSupplier', () => {
  it('parses against the canonical SupplierSchema', () => {
    expect(() => SupplierSchema.parse(transformSupplier(raw))).not.toThrow()
  })

  it('maps the documented fields', () => {
    const s = SupplierSchema.parse(transformSupplier(raw))
    expect(s.id).toBe('3001')
    expect(s.externalId).toBe('3001')
    expect(s.name).toBe('Acme Suppliers')
    expect(s.email).toBe('orders@acme.example')
    expect(s.phone).toBe('+33 1 00 00 00 00')
    expect(s.defaultCurrency).toBe('EUR')
    expect(s.isActive).toBe(true)
    expect(s.defaultLeadTimeDays).toBeUndefined()
    expect(s.metadata).toEqual({ supplier_number: 'SUP-3001' })
  })

  it('leaves the currency absent when the supplier has none', () => {
    expect(transformSupplier({ ...raw, currency: null }).defaultCurrency).toBeUndefined()
  })

  it('drops an email that is not an address rather than failing the parse', () => {
    const s = transformSupplier({ ...raw, email: 'call Bob' })
    expect(() => SupplierSchema.parse(s)).not.toThrow()
    expect(s.email).toBeUndefined()
  })

  it('reads active: false', () => {
    expect(transformSupplier({ ...raw, active: false }).isActive).toBe(false)
  })
})
