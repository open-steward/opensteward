import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawSkuNexusSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/skunexus/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('skunexus transformSupplier', () => {
  const raw: RawSkuNexusSupplier = {
    id: 'V10',
    name: 'Acme Corp',
    email: 'orders@acme.example',
    phone: '+14155550199',
    currency: 'USD',
    lead_time_days: 14,
    active: true,
  }

  it('maps id, name, email, phone', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('V10')
    expect(result.name).toBe('Acme Corp')
    expect(result.email).toBe('orders@acme.example')
    expect(result.phone).toBe('+14155550199')
    expect(result.platform).toBe('skunexus')
  })

  it('maps defaultCurrency and defaultLeadTimeDays', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBe('USD')
    expect(result.defaultLeadTimeDays).toBe(14)
  })

  it('sets isActive=true from active=true', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive=false from active=false', () => {
    const result = transformSupplier({ ...raw, active: false })
    expect(result.isActive).toBe(false)
  })

  it('archived=true overrides active and marks isActive=false', () => {
    const result = transformSupplier({ ...raw, archived: true })
    expect(result.isActive).toBe(false)
  })

  it('derives isActive from status when active and archived are absent', () => {
    const { active: _, ...noActive } = raw
    const activeResult = transformSupplier({ ...noActive, status: 'active' })
    expect(activeResult.isActive).toBe(true)

    const inactiveResult = transformSupplier({ ...noActive, status: 'inactive' })
    expect(inactiveResult.isActive).toBe(false)
  })

  it('produces output satisfying SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
