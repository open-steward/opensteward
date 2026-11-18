import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawOpenbravoBusinessPartner,
} from '../../../../../../../src/verticals/inventory/adapters/openbravo/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('openbravo transformSupplier', () => {
  const raw: RawOpenbravoBusinessPartner = {
    id: 'bp-uuid-001',
    searchKey: 'KBD',
    name: 'Keyboards Inc',
    active: true,
    vendor: true,
    email: 'orders@keyboards.example',
    phone: '+14155550199',
    currency: { _identifier: 'USD' },
    purchaseLeadtime: 14,
    purchasePricelist: { id: 'pl-001', _identifier: 'Standard Price List' },
    creationDate: '2024-03-01T00:00:00Z',
    updated: '2024-03-01T00:00:00Z',
  }

  it('maps id and externalId', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('bp-uuid-001')
    expect(result.externalId).toBe('bp-uuid-001')
  })

  it('maps name', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Keyboards Inc')
  })

  it('maps email', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('orders@keyboards.example')
  })

  it('maps phone', () => {
    const result = transformSupplier(raw)
    expect(result.phone).toBe('+14155550199')
  })

  it('maps defaultCurrency from currency._identifier', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBe('USD')
  })

  it('maps defaultLeadTimeDays from purchaseLeadtime', () => {
    const result = transformSupplier(raw)
    expect(result.defaultLeadTimeDays).toBe(14)
  })

  it('maps isActive as true when both active and vendor are true', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps isActive as false when vendor is false', () => {
    const result = transformSupplier({ ...raw, vendor: false })
    expect(result.isActive).toBe(false)
  })

  it('sets platform to openbravo', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('openbravo')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
