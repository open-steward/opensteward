import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawSpsCommerceSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/sps-commerce/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('transformSupplier — sps-commerce', () => {
  const raw: RawSpsCommerceSupplier = {
    vendor_id: 'VEND-10',
    vendor_name: 'Keyboards Inc',
    email: 'orders@keyboards.example',
    phone: '+14155550199',
    currency_code: 'USD',
    lead_time_days: 14,
    status: 'ACTIVE',
    trading_partner_id: 'TP-999',
  }
  const result = transformSupplier(raw)

  it('maps id from vendor_id', () => {
    expect(result.id).toBe('VEND-10')
  })

  it('maps name from vendor_name', () => {
    expect(result.name).toBe('Keyboards Inc')
  })

  it('maps email', () => {
    expect(result.email).toBe('orders@keyboards.example')
  })

  it('maps phone', () => {
    expect(result.phone).toBe('+14155550199')
  })

  it('maps defaultCurrency from currency_code', () => {
    expect(result.defaultCurrency).toBe('USD')
  })

  it('maps defaultLeadTimeDays from lead_time_days', () => {
    expect(result.defaultLeadTimeDays).toBe(14)
  })

  it('maps isActive: true for ACTIVE status', () => {
    expect(result.isActive).toBe(true)
  })

  it('stores tradingPartnerId in metadata', () => {
    expect(result.metadata['tradingPartnerId']).toBe('TP-999')
  })

  it('sets platform to sps-commerce', () => {
    expect(result.platform).toBe('sps-commerce')
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})

describe('transformSupplier — sps-commerce INACTIVE status', () => {
  const raw: RawSpsCommerceSupplier = {
    vendor_id: 'VEND-OLD',
    vendor_name: 'Old Vendor',
    status: 'INACTIVE',
  }
  const result = transformSupplier(raw)

  it('maps isActive: false for INACTIVE status', () => {
    expect(result.isActive).toBe(false)
  })

  it('passes schema validation', () => {
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
