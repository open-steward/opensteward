import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawCamelot3plSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/camelot-3pl/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('camelot-3pl transformSupplier', () => {
  const raw: RawCamelot3plSupplier = {
    vendorId: 'vendor-001',
    vendorName: 'Acme Supplies Inc.',
    contactEmail: 'orders@acme.example',
    contactPhone: '+14155550199',
    currency: 'USD',
    leadTimeDays: 7,
    isActive: true,
  }

  it('maps id and externalId from vendorId', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('vendor-001')
    expect(result.externalId).toBe('vendor-001')
  })

  it('maps name from vendorName', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Acme Supplies Inc.')
  })

  it('maps email from contactEmail', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('orders@acme.example')
  })

  it('maps phone from contactPhone', () => {
    const result = transformSupplier(raw)
    expect(result.phone).toBe('+14155550199')
  })

  it('maps defaultCurrency from currency', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBe('USD')
  })

  it('maps defaultLeadTimeDays from leadTimeDays', () => {
    const result = transformSupplier(raw)
    expect(result.defaultLeadTimeDays).toBe(7)
  })

  it('sets isActive to true when isActive is boolean true', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive to false when isActive is boolean false', () => {
    const result = transformSupplier({ ...raw, isActive: false })
    expect(result.isActive).toBe(false)
  })

  it('sets isActive to true when isActive is 1', () => {
    const result = transformSupplier({ ...raw, isActive: 1 })
    expect(result.isActive).toBe(true)
  })

  it('sets isActive to false when isActive is 0', () => {
    const result = transformSupplier({ ...raw, isActive: 0 })
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when isActive is absent', () => {
    const result = transformSupplier({ vendorId: 'v-999', vendorName: 'Test' })
    expect(result.isActive).toBe(true)
  })

  it('sets platform to camelot-3pl', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('camelot-3pl')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
