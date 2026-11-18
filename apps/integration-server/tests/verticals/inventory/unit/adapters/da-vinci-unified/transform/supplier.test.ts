import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawDaVinciUnifiedSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/da-vinci-unified/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('da-vinci-unified transformSupplier', () => {
  const raw: RawDaVinciUnifiedSupplier = {
    vendorId: 'vendor-001',
    vendorName: 'Acme Corp',
    email: 'orders@acme.example',
    phone: '+14155550100',
    currencyCode: 'USD',
    leadTimeDays: 14,
    isActive: true,
  }

  it('maps id and externalId from vendorId', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('vendor-001')
    expect(result.externalId).toBe('vendor-001')
  })

  it('maps name from vendorName', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Acme Corp')
  })

  it('maps email', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('orders@acme.example')
  })

  it('maps defaultCurrency from currencyCode', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBe('USD')
  })

  it('maps defaultLeadTimeDays from leadTimeDays', () => {
    const result = transformSupplier(raw)
    expect(result.defaultLeadTimeDays).toBe(14)
  })

  it('maps isActive', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('defaults isActive to true when absent', () => {
    const result = transformSupplier({ vendorId: 'vendor-002' })
    expect(result.isActive).toBe(true)
  })

  it('sets platform to da-vinci-unified', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('da-vinci-unified')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
