import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawTexadaSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/texada/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('transformSupplier', () => {
  const base: RawTexadaSupplier = {
    vendorId: 'vendor-001',
    vendorName: 'Caterpillar Financial',
    email: 'orders@catfinancial.example',
    phone: '+15125550199',
    fax: '+15125550200',
    currency: 'USD',
    leadTimeDays: 14,
    active: true,
    address1: '100 Vendor Blvd',
    city: 'Peoria',
    state: 'IL',
    country: 'US',
    postalCode: '61602',
    taxId: 'EIN-12-3456789',
  }

  it('maps vendorId → id and externalId', () => {
    const result = transformSupplier(base)
    expect(result.id).toBe('vendor-001')
    expect(result.externalId).toBe('vendor-001')
  })

  it('maps vendorName → name', () => {
    const result = transformSupplier(base)
    expect(result.name).toBe('Caterpillar Financial')
  })

  it('maps email → email', () => {
    const result = transformSupplier(base)
    expect(result.email).toBe('orders@catfinancial.example')
  })

  it('maps phone → phone', () => {
    const result = transformSupplier(base)
    expect(result.phone).toBe('+15125550199')
  })

  it('maps currency → defaultCurrency', () => {
    const result = transformSupplier(base)
    expect(result.defaultCurrency).toBe('USD')
  })

  it('maps leadTimeDays → defaultLeadTimeDays', () => {
    const result = transformSupplier(base)
    expect(result.defaultLeadTimeDays).toBe(14)
  })

  it('resolves isActive from boolean active', () => {
    const result = transformSupplier(base)
    expect(result.isActive).toBe(true)
  })

  it('resolves isActive from string "Y"', () => {
    const result = transformSupplier({ ...base, active: 'Y' })
    expect(result.isActive).toBe(true)
  })

  it('resolves isActive=false from string "false"', () => {
    const result = transformSupplier({ ...base, active: 'false' })
    expect(result.isActive).toBe(false)
  })

  it('resolves isActive via status when active is absent', () => {
    const { active, ...rest } = base
    const result = transformSupplier({ ...rest, status: 'inactive' })
    expect(result.isActive).toBe(false)
  })

  it('resolves isActive=true when status is not "inactive"', () => {
    const { active, ...rest } = base
    const result = transformSupplier({ ...rest, status: 'active' })
    expect(result.isActive).toBe(true)
  })

  it('falls back vendorNo → id when vendorId is absent', () => {
    const { vendorId, ...rest } = base
    const result = transformSupplier({ ...rest, vendorNo: 'VN-999' })
    expect(result.id).toBe('VN-999')
  })

  it('falls back id → id when vendorId and vendorNo are absent', () => {
    const { vendorId, ...rest } = base
    const result = transformSupplier({ ...rest, id: 'ID-FALLBACK' })
    expect(result.id).toBe('ID-FALLBACK')
  })

  it('falls back name → name when vendorName is absent', () => {
    const { vendorName, ...rest } = base
    const result = transformSupplier({ ...rest, name: 'Fallback Name' })
    expect(result.name).toBe('Fallback Name')
  })

  it('falls back currencyCode → defaultCurrency when currency is absent', () => {
    const { currency, ...rest } = base
    const result = transformSupplier({ ...rest, currencyCode: 'CAD' })
    expect(result.defaultCurrency).toBe('CAD')
  })

  it('falls back leadTime → defaultLeadTimeDays when leadTimeDays is absent', () => {
    const { leadTimeDays, ...rest } = base
    const result = transformSupplier({ ...rest, leadTime: 21 })
    expect(result.defaultLeadTimeDays).toBe(21)
  })

  it('sets platform to "texada"', () => {
    const result = transformSupplier(base)
    expect(result.platform).toBe('texada')
  })

  it('stores fax in metadata', () => {
    const result = transformSupplier(base)
    expect(result.metadata['fax']).toBe('+15125550200')
  })

  it('stores taxId in metadata', () => {
    const result = transformSupplier(base)
    expect(result.metadata['taxId']).toBe('EIN-12-3456789')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(base)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
