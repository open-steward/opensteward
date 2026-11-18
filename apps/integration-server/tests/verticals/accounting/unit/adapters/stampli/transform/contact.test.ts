import { describe, it, expect } from 'vitest'
import {
  transformVendor,
  type StampliVendor,
} from '../../../../../../../src/verticals/accounting/adapters/stampli/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/accounting/schema/contact'

function makeRaw(overrides: Partial<StampliVendor> = {}): StampliVendor {
  return {
    id: 'vendor-001',
    vendorName: 'Acme Supplies Inc',
    vendorCode: 'ACME-001',
    taxId: 'US-123456789',
    status: 'ACTIVE',
    email: 'ap@acme.example',
    phone: '+1-555-123-4567',
    fax: '+1-555-987-6543',
    address1: '123 Main St',
    address2: 'Suite 100',
    city: 'Springfield',
    state: 'IL',
    postalCode: '62701',
    country: 'US',
    currency: 'USD',
    createdAt: '2024-01-15T09:30:00.000Z',
    updatedAt: '2024-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('stampli transformVendor', () => {
  it('maps id', () => {
    expect(transformVendor(makeRaw()).id).toBe('vendor-001')
  })

  it('maps vendorName to name', () => {
    expect(transformVendor(makeRaw()).name).toBe('Acme Supplies Inc')
  })

  it('maps vendorCode to identification', () => {
    expect(transformVendor(makeRaw()).identification).toBe('ACME-001')
  })

  it('maps taxId to taxNumber', () => {
    expect(transformVendor(makeRaw()).taxNumber).toBe('US-123456789')
  })

  it('sets isSupplier=true', () => {
    expect(transformVendor(makeRaw()).isSupplier).toBe(true)
  })

  it('sets isCustomer=false', () => {
    expect(transformVendor(makeRaw()).isCustomer).toBe(false)
  })

  it('maps ACTIVE status to isActive=true', () => {
    expect(transformVendor(makeRaw({ status: 'ACTIVE' })).isActive).toBe(true)
  })

  it('maps non-ACTIVE status to isActive=false', () => {
    expect(transformVendor(makeRaw({ status: 'INACTIVE' })).isActive).toBe(false)
  })

  it('maps currency', () => {
    expect(transformVendor(makeRaw()).currency).toBe('USD')
  })

  it('maps email to emails array', () => {
    const result = transformVendor(makeRaw())
    expect(result.emails).toHaveLength(1)
    expect(result.emails![0].email).toBe('ap@acme.example')
    expect(result.emails![0].type).toBe('WORK')
  })

  it('maps phone and fax to telephones array', () => {
    const result = transformVendor(makeRaw())
    expect(result.telephones).toHaveLength(2)
    expect(result.telephones![0].type).toBe('WORK')
    expect(result.telephones![1].type).toBe('FAX')
  })

  it('maps billing address fields', () => {
    const result = transformVendor(makeRaw())
    expect(result.billingAddress?.address1).toBe('123 Main St')
    expect(result.billingAddress?.city).toBe('Springfield')
    expect(result.billingAddress?.country).toBe('US')
  })

  it('maps createdAt to Date', () => {
    expect(transformVendor(makeRaw()).createdAt).toEqual(new Date('2024-01-15T09:30:00.000Z'))
  })

  it('passes ContactSchema validation', () => {
    expect(() => ContactSchema.parse(transformVendor(makeRaw()))).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformVendor(raw).metadata).toBe(raw)
  })

  it('handles no email gracefully', () => {
    const result = transformVendor(makeRaw({ email: undefined }))
    expect(result.emails).toBeUndefined()
  })
})
