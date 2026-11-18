import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawVendSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/vend-pos/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

const baseRaw: RawVendSupplier = {
  id: 'sup-uuid-001',
  name: 'Keyboards Inc',
  description: 'Keyboard manufacturer and distributor',
  source: 'import',
  deleted_at: null,
}

describe('vend-pos transformSupplier', () => {
  it('maps id from id field', () => {
    expect(transformSupplier(baseRaw).id).toBe('sup-uuid-001')
  })

  it('maps name from name field', () => {
    expect(transformSupplier(baseRaw).name).toBe('Keyboards Inc')
  })

  it('maps isActive true when deleted_at is null', () => {
    expect(transformSupplier(baseRaw).isActive).toBe(true)
  })

  it('maps isActive false when deleted_at is present', () => {
    const result = transformSupplier({ ...baseRaw, deleted_at: '2024-03-01T00:00:00Z' })
    expect(result.isActive).toBe(false)
  })

  it('has no email, phone, currency, or lead time (Vend supplier model is lean)', () => {
    const result = transformSupplier(baseRaw)
    expect(result.email).toBeUndefined()
    expect(result.phone).toBeUndefined()
    expect(result.defaultCurrency).toBeUndefined()
    expect(result.defaultLeadTimeDays).toBeUndefined()
  })

  it('sets platform to vend-pos', () => {
    expect(transformSupplier(baseRaw).platform).toBe('vend-pos')
  })

  it('produces output that satisfies SupplierSchema', () => {
    expect(() => SupplierSchema.parse(transformSupplier(baseRaw))).not.toThrow()
  })
})
