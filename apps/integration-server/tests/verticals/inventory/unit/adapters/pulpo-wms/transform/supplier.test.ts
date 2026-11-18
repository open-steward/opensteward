import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawPulpoWmsSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/pulpo-wms/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('pulpo-wms transformSupplier', () => {
  const raw: RawPulpoWmsSupplier = {
    id: 'sup-001',
    name: 'ACME Supply Co',
    email: 'orders@acme.example',
    phone: '+491234567890',
    currency: 'EUR',
    lead_time_days: 14,
    status: 'active',
    is_active: true,
  }

  it('maps id and name', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('sup-001')
    expect(result.name).toBe('ACME Supply Co')
  })

  it('maps email, phone and defaultCurrency', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('orders@acme.example')
    expect(result.phone).toBe('+491234567890')
    expect(result.defaultCurrency).toBe('EUR')
  })

  it('maps defaultLeadTimeDays', () => {
    const result = transformSupplier(raw)
    expect(result.defaultLeadTimeDays).toBe(14)
  })

  it('uses is_active boolean when present', () => {
    expect(transformSupplier({ ...raw, is_active: true }).isActive).toBe(true)
    expect(transformSupplier({ ...raw, is_active: false }).isActive).toBe(false)
  })

  it('falls back to status !== "inactive" when is_active is absent', () => {
    expect(transformSupplier({ ...raw, is_active: undefined, status: 'active' }).isActive).toBe(
      true,
    )
    expect(transformSupplier({ ...raw, is_active: undefined, status: 'inactive' }).isActive).toBe(
      false,
    )
  })

  it('sets platform to pulpo-wms', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('pulpo-wms')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
