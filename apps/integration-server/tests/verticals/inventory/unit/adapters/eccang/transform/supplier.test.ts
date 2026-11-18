import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawEccangSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/eccang/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('eccang transformSupplier', () => {
  const raw: RawEccangSupplier = {
    supplier_id: 9001,
    supplier_code: 'SUP-CODE-1',
    supplier_name: 'Shenzhen Components Co',
    contact_email: 'sales@szcomponents.example',
    contact_phone: '+8675587654321',
    currency: 'CNY',
    lead_time: 10,
    status: 'active',
    country: 'CN',
  }

  it('maps id and externalId from supplier_id as string', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('9001')
    expect(result.externalId).toBe('9001')
  })

  it('falls back to supplier_code for id when supplier_id absent', () => {
    const result = transformSupplier({ ...raw, supplier_id: undefined })
    expect(result.id).toBe('SUP-CODE-1')
  })

  it('maps name from supplier_name', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Shenzhen Components Co')
  })

  it('maps email from contact_email', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('sales@szcomponents.example')
  })

  it('maps phone from contact_phone', () => {
    const result = transformSupplier(raw)
    expect(result.phone).toBe('+8675587654321')
  })

  it('maps defaultCurrency from currency', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBe('CNY')
  })

  it('maps defaultLeadTimeDays from lead_time', () => {
    const result = transformSupplier(raw)
    expect(result.defaultLeadTimeDays).toBe(10)
  })

  it('sets isActive true when status is active', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when status is inactive', () => {
    const result = transformSupplier({ ...raw, status: 'inactive' })
    expect(result.isActive).toBe(false)
  })

  it('sets isActive false when status is "0"', () => {
    const result = transformSupplier({ ...raw, status: '0' })
    expect(result.isActive).toBe(false)
  })

  it('sets isActive false when status is disabled', () => {
    const result = transformSupplier({ ...raw, status: 'disabled' })
    expect(result.isActive).toBe(false)
  })

  it('stores status and country in metadata', () => {
    const result = transformSupplier(raw)
    expect(result.metadata.status).toBe('active')
    expect(result.metadata.country).toBe('CN')
  })

  it('sets platform to eccang', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('eccang')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
