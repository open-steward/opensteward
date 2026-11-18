import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawTruecommerceSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/truecommerce/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRaw(overrides: Partial<RawTruecommerceSupplier> = {}): RawTruecommerceSupplier {
  return {
    partner_id: 'sup_001',
    company_name: 'Keyboards Inc',
    contact_email: 'orders@keyboards.example',
    contact_phone: '+14155550199',
    default_currency: 'USD',
    lead_time_days: 14,
    status: 'active',
    ...overrides,
  }
}

// ─── transformSupplier ────────────────────────────────────────────────────────

describe('transformSupplier', () => {
  it('maps id and externalId from partner_id', () => {
    const result = transformSupplier(makeRaw())
    expect(result.id).toBe('sup_001')
    expect(result.externalId).toBe('sup_001')
  })

  it('maps name from company_name', () => {
    const result = transformSupplier(makeRaw())
    expect(result.name).toBe('Keyboards Inc')
  })

  it('uses empty string for name when company_name is absent', () => {
    const result = transformSupplier(makeRaw({ company_name: undefined }))
    expect(result.name).toBe('')
  })

  it('maps email from contact_email', () => {
    const result = transformSupplier(makeRaw())
    expect(result.email).toBe('orders@keyboards.example')
  })

  it('maps phone from contact_phone', () => {
    const result = transformSupplier(makeRaw())
    expect(result.phone).toBe('+14155550199')
  })

  it('maps defaultCurrency from default_currency', () => {
    const result = transformSupplier(makeRaw())
    expect(result.defaultCurrency).toBe('USD')
  })

  it('maps defaultLeadTimeDays from lead_time_days number', () => {
    const result = transformSupplier(makeRaw())
    expect(result.defaultLeadTimeDays).toBe(14)
  })

  it('maps defaultLeadTimeDays from lead_time_days as a numeric string', () => {
    const result = transformSupplier(makeRaw({ lead_time_days: '21' }))
    expect(result.defaultLeadTimeDays).toBe(21)
  })

  it('isActive is true when status is "active"', () => {
    const result = transformSupplier(makeRaw({ status: 'active' }))
    expect(result.isActive).toBe(true)
  })

  it('isActive is false when status is "inactive"', () => {
    const result = transformSupplier(makeRaw({ status: 'inactive' }))
    expect(result.isActive).toBe(false)
  })

  it('isActive is false when status is "INACTIVE" (case-insensitive)', () => {
    const result = transformSupplier(makeRaw({ status: 'INACTIVE' }))
    expect(result.isActive).toBe(false)
  })

  it('isActive is true when status is absent (empty string check)', () => {
    const result = transformSupplier(makeRaw({ status: undefined }))
    // ('' ).toLowerCase() !== 'inactive' → true
    expect(result.isActive).toBe(true)
  })

  it('puts status in metadata', () => {
    const result = transformSupplier(makeRaw({ status: 'active' }))
    expect(result.metadata['status']).toBe('active')
  })

  it('hardcodes platform to "truecommerce"', () => {
    const result = transformSupplier(makeRaw())
    expect(result.platform).toBe('truecommerce')
  })

  it('passes SupplierSchema.parse without throwing', () => {
    const result = transformSupplier(makeRaw())
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
