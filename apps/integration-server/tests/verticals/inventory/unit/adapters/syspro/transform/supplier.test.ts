import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawSysproSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/syspro/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

function makeRaw(overrides: Partial<RawSysproSupplier> = {}): RawSysproSupplier {
  return {
    Supplier: 'SUP001',
    Name: 'Global Parts Ltd',
    Email: 'orders@globalparts.example',
    Telephone: '+27117001234',
    Currency: 'ZAR',
    InvoiceTerms: 'NET30',
    TaxCode: 'STD',
    EcVatCode: '',
    SupplierOnHold: 'N',
    SupplierStatus: 'P',
    ...overrides,
  }
}

describe('transformSupplier (syspro)', () => {
  it('maps id and externalId from Supplier code', () => {
    const result = transformSupplier(makeRaw())
    expect(result.id).toBe('SUP001')
    expect(result.externalId).toBe('SUP001')
  })

  it('maps name from Name, falling back to Supplier code', () => {
    const result = transformSupplier(makeRaw())
    expect(result.name).toBe('Global Parts Ltd')

    const resultNoName = transformSupplier(makeRaw({ Name: undefined }))
    expect(resultNoName.name).toBe('SUP001')
  })

  it('maps email and phone', () => {
    const result = transformSupplier(makeRaw())
    expect(result.email).toBe('orders@globalparts.example')
    expect(result.phone).toBe('+27117001234')
  })

  it('maps defaultCurrency from Currency', () => {
    const result = transformSupplier(makeRaw())
    expect(result.defaultCurrency).toBe('ZAR')
  })

  it('isActive is true when SupplierOnHold is "N" and SupplierStatus is "P"', () => {
    const result = transformSupplier(makeRaw())
    expect(result.isActive).toBe(true)
  })

  it('isActive is false when SupplierOnHold is "Y"', () => {
    const result = transformSupplier(makeRaw({ SupplierOnHold: 'Y' }))
    expect(result.isActive).toBe(false)
  })

  it('isActive is false when SupplierStatus is "T" (temporary)', () => {
    const result = transformSupplier(makeRaw({ SupplierStatus: 'T' }))
    expect(result.isActive).toBe(false)
  })

  it('defaultLeadTimeDays is undefined (not available on ApSupplier)', () => {
    const result = transformSupplier(makeRaw())
    expect(result.defaultLeadTimeDays).toBeUndefined()
  })

  it('platform is "syspro"', () => {
    const result = transformSupplier(makeRaw())
    expect(result.platform).toBe('syspro')
  })

  it('passes SupplierSchema validation', () => {
    const result = transformSupplier(makeRaw())
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
