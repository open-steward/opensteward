import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawE2openSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/e2open/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('e2open transformSupplier', () => {
  const raw: RawE2openSupplier = {
    zymeId: 'ZYME-001',
    partnerCode: 'PARTNER-001',
    businessName: 'Global Supplies Ltd',
    businessPhone: '+442071234567',
    website: 'https://globalsupplies.example',
    email: 'orders@globalsupplies.example',
    isoCountryCode: 'GB',
    status: 'Active',
    currencyCode: 'GBP',
    leadTimeDays: 7,
  }

  it('maps id and externalId from zymeId', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('ZYME-001')
    expect(result.externalId).toBe('ZYME-001')
  })

  it('falls back to partnerCode for id when zymeId absent', () => {
    const result = transformSupplier({ ...raw, zymeId: undefined })
    expect(result.id).toBe('PARTNER-001')
  })

  it('maps name from businessName', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Global Supplies Ltd')
  })

  it('maps email from email', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('orders@globalsupplies.example')
  })

  it('maps phone from businessPhone', () => {
    const result = transformSupplier(raw)
    expect(result.phone).toBe('+442071234567')
  })

  it('maps defaultCurrency from currencyCode', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBe('GBP')
  })

  it('maps defaultLeadTimeDays from leadTimeDays', () => {
    const result = transformSupplier(raw)
    expect(result.defaultLeadTimeDays).toBe(7)
  })

  it('sets isActive true when status is Active', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when status is Inactive', () => {
    const result = transformSupplier({ ...raw, status: 'Inactive' })
    expect(result.isActive).toBe(false)
  })

  it('stores isoCountryCode in metadata', () => {
    const result = transformSupplier(raw)
    expect(result.metadata.isoCountryCode).toBe('GB')
  })

  it('sets platform to e2open', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('e2open')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
