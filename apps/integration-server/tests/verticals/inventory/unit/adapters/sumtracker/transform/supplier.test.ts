import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawSumtrackerSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/sumtracker/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

function makeRaw(overrides: Partial<RawSumtrackerSupplier> = {}): RawSumtrackerSupplier {
  return {
    id: 99,
    name: 'Acme Supplies',
    email: 'orders@acme.example',
    phone: '+14155550100',
    currency: 'USD',
    lead_time: 7,
    status: 'active',
    ...overrides,
  }
}

describe('transformSupplier (sumtracker)', () => {
  it('maps id and externalId from numeric raw.id', () => {
    const result = transformSupplier(makeRaw({ id: 99 }))
    expect(result.id).toBe('99')
    expect(result.externalId).toBe('99')
  })

  it('maps name, email, and phone', () => {
    const result = transformSupplier(makeRaw())
    expect(result.name).toBe('Acme Supplies')
    expect(result.email).toBe('orders@acme.example')
    expect(result.phone).toBe('+14155550100')
  })

  it('maps defaultCurrency', () => {
    const result = transformSupplier(makeRaw())
    expect(result.defaultCurrency).toBe('USD')
  })

  it('maps defaultLeadTimeDays from lead_time', () => {
    const result = transformSupplier(makeRaw({ lead_time: 14 }))
    expect(result.defaultLeadTimeDays).toBe(14)
  })

  it('isActive is true when status is "active"', () => {
    const result = transformSupplier(makeRaw({ status: 'active' }))
    expect(result.isActive).toBe(true)
  })

  it('isActive is false when status is "inactive"', () => {
    const result = transformSupplier(makeRaw({ status: 'inactive' }))
    expect(result.isActive).toBe(false)
  })

  it('platform is "sumtracker"', () => {
    const result = transformSupplier(makeRaw())
    expect(result.platform).toBe('sumtracker')
  })

  it('passes SupplierSchema validation', () => {
    const result = transformSupplier(makeRaw())
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
