import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawInventoryPlannerVendor,
} from '../../../../../../../src/verticals/inventory/adapters/inventory-planner/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('inventory-planner transformSupplier', () => {
  const raw: RawInventoryPlannerVendor = {
    _id: 'vendor-001',
    name: 'KeyboardCo',
    email: 'supply@keyboardco.example',
    phone: '+14155550100',
    currency: 'USD',
    lead_time: 14,
    moq: 50,
    active: true,
  }

  it('maps id and externalId from _id', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('vendor-001')
    expect(result.externalId).toBe('vendor-001')
  })

  it('maps name', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('KeyboardCo')
  })

  it('maps defaultCurrency from currency', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBe('USD')
  })

  it('maps defaultLeadTimeDays from lead_time', () => {
    const result = transformSupplier(raw)
    expect(result.defaultLeadTimeDays).toBe(14)
  })

  it('maps isActive true when active is true', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps isActive false when active is false', () => {
    const result = transformSupplier({ ...raw, active: false })
    expect(result.isActive).toBe(false)
  })

  it('maps isActive true when active is undefined', () => {
    const result = transformSupplier({ ...raw, active: undefined })
    expect(result.isActive).toBe(true)
  })

  it('sets platform to inventory-planner', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('inventory-planner')
  })

  it('defaults name to empty string when name absent', () => {
    const result = transformSupplier({ _id: 'v-x', active: true })
    expect(result.name).toBe('')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
