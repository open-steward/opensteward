import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawManhattanActiveSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/manhattan-active/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('manhattan-active transformSupplier', () => {
  const raw: RawManhattanActiveSupplier = {
    supplierId: 'SUP-001',
    supplierName: 'Industrial Parts Co',
    supplierCode: 'IPC',
    email: 'orders@ipc.example.com',
    phone: '+1-800-555-0100',
    currency: 'USD',
    leadTimeDays: 14,
    status: 'ACTIVE',
  }

  it('maps id and externalId from supplierId', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('SUP-001')
    expect(result.externalId).toBe('SUP-001')
  })

  it('maps name from supplierName', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Industrial Parts Co')
  })

  it('falls back name to supplierCode when supplierName absent', () => {
    const result = transformSupplier({ ...raw, supplierName: undefined })
    expect(result.name).toBe('IPC')
  })

  it('maps email from email field', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('orders@ipc.example.com')
  })

  it('maps phone from phone field', () => {
    const result = transformSupplier(raw)
    expect(result.phone).toBe('+1-800-555-0100')
  })

  it('maps defaultCurrency from currency field', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBe('USD')
  })

  it('maps defaultLeadTimeDays from leadTimeDays', () => {
    const result = transformSupplier(raw)
    expect(result.defaultLeadTimeDays).toBe(14)
  })

  it('sets isActive true when status is ACTIVE', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when status is INACTIVE', () => {
    const result = transformSupplier({ ...raw, status: 'INACTIVE' })
    expect(result.isActive).toBe(false)
  })

  it('sets platform to manhattan-active', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('manhattan-active')
  })

  it('produces output that satisfies SupplierSchema', () => {
    expect(() => SupplierSchema.parse(transformSupplier(raw))).not.toThrow()
  })
})
