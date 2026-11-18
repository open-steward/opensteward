import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawEpicorKineticVendor,
} from '../../../../../../../src/verticals/inventory/adapters/epicor-kinetic/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('epicor-kinetic transformSupplier', () => {
  const raw: RawEpicorKineticVendor = {
    VendorNum: 42,
    VendorID: 'VENDOR-A',
    Name: 'Keyboards Inc',
    EMailAddress: 'orders@keyboards.example',
    PhoneNum: '+14155550199',
    CurrencyCode: 'USD',
    Inactive: false,
    TermsCode: 'NET30',
    SysRowID: 'guid-vendor-001',
  }

  it('maps id from VendorNum', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('42')
  })

  it('maps externalId from SysRowID', () => {
    const result = transformSupplier(raw)
    expect(result.externalId).toBe('guid-vendor-001')
  })

  it('maps name from Name', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Keyboards Inc')
  })

  it('maps email from EMailAddress', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('orders@keyboards.example')
  })

  it('maps phone from PhoneNum', () => {
    const result = transformSupplier(raw)
    expect(result.phone).toBe('+14155550199')
  })

  it('maps defaultCurrency from CurrencyCode', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBe('USD')
  })

  it('sets isActive true when Inactive is false', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('sets isActive false when Inactive is true', () => {
    const result = transformSupplier({ ...raw, Inactive: true })
    expect(result.isActive).toBe(false)
  })

  it('falls back to VendorID for name when Name is absent', () => {
    const result = transformSupplier({ ...raw, Name: undefined })
    expect(result.name).toBe('VENDOR-A')
  })

  it('sets platform to epicor-kinetic', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('epicor-kinetic')
  })

  it('produces output that satisfies SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
