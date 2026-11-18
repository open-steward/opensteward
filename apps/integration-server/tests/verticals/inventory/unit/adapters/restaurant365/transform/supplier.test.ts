import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawR365Company,
} from '../../../../../../../src/verticals/inventory/adapters/restaurant365/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('restaurant365 transformSupplier', () => {
  const raw: RawR365Company = {
    companyId: 'company-guid-001',
    name: 'Prime Foods Distributors',
    companyNumber: 'VEND-001',
    comment: 'Preferred vendor for proteins',
    createdBy: 'admin',
    createdOn: '2024-03-01T00:00:00Z',
    modifiedBy: 'manager',
    modifiedOn: '2024-03-01T00:00:00Z',
  }

  it('maps companyId to id and externalId', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('company-guid-001')
    expect(result.externalId).toBe('company-guid-001')
  })

  it('maps name', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Prime Foods Distributors')
  })

  it('always sets isActive to true', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('leaves email, phone, defaultCurrency, defaultLeadTimeDays undefined', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBeUndefined()
    expect(result.phone).toBeUndefined()
    expect(result.defaultCurrency).toBeUndefined()
    expect(result.defaultLeadTimeDays).toBeUndefined()
  })

  it('stores companyNumber and comment in metadata', () => {
    const result = transformSupplier(raw)
    expect(result.metadata['companyNumber']).toBe('VEND-001')
    expect(result.metadata['comment']).toBe('Preferred vendor for proteins')
  })

  it('sets platform to restaurant365', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('restaurant365')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
