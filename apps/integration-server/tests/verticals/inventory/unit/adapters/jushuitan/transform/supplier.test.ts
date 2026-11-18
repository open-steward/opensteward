import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawJushuitanSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/jushuitan/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('jushuitan transformSupplier', () => {
  const raw: RawJushuitanSupplier = {
    supplier_id: 7,
    supplier_name: 'Acme Corp',
    contact: 'Jane Smith',
    mobile: '+86-10-12345678',
    email: 'supplier@acme.com',
    enabled: 1,
    currency: 'CNY',
    lead_time: 14,
    created: '2024-03-01T00:00:00Z',
    modified: '2024-03-01T00:00:00Z',
  }

  it('maps id from supplier_id', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('7')
    expect(result.externalId).toBe('7')
  })

  it('maps name from supplier_name', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Acme Corp')
  })

  it('maps email', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('supplier@acme.com')
  })

  it('maps phone from mobile', () => {
    const result = transformSupplier(raw)
    expect(result.phone).toBe('+86-10-12345678')
  })

  it('maps defaultCurrency from currency', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBe('CNY')
  })

  it('maps defaultLeadTimeDays from lead_time', () => {
    const result = transformSupplier(raw)
    expect(result.defaultLeadTimeDays).toBe(14)
  })

  it('sets isActive true when enabled=1', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('defaults isActive to true when enabled is missing', () => {
    const result = transformSupplier({ ...raw, enabled: undefined })
    expect(result.isActive).toBe(true)
  })

  it('sets platform to jushuitan', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('jushuitan')
  })

  it('produces output that satisfies SupplierSchema', () => {
    expect(() => SupplierSchema.parse(transformSupplier(raw))).not.toThrow()
  })
})
