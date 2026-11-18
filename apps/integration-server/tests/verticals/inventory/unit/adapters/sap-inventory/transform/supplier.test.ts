import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawSapSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/sap-inventory/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('sap-inventory transformSupplier', () => {
  const raw: RawSapSupplier = {
    Supplier: 'SUP001',
    BusinessPartnerFullName: 'Keyboards Inc',
    Currency: 'USD',
    SupplierIsBlockedForPosting: false,
    DeletionIndicator: false,
    EmailAddress: 'orders@keyboards.example',
    PhoneNumber: '+14155550199',
  }

  it('maps id from Supplier', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('SUP001')
  })

  it('prefers BusinessPartnerFullName for name', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Keyboards Inc')
  })

  it('falls back name to SupplierName', () => {
    const result = transformSupplier({
      ...raw,
      BusinessPartnerFullName: undefined,
      SupplierName: 'KBD Ltd',
    })
    expect(result.name).toBe('KBD Ltd')
  })

  it('falls back name to Supplier number when all names absent', () => {
    const result = transformSupplier({
      Supplier: 'SUP002',
      SupplierIsBlockedForPosting: false,
      DeletionIndicator: false,
    })
    expect(result.name).toBe('SUP002')
  })

  it('not blocked and not deleted → isActive true', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('SupplierIsBlockedForPosting true → isActive false', () => {
    const result = transformSupplier({ ...raw, SupplierIsBlockedForPosting: true })
    expect(result.isActive).toBe(false)
  })

  it('DeletionIndicator true → isActive false', () => {
    const result = transformSupplier({ ...raw, DeletionIndicator: true })
    expect(result.isActive).toBe(false)
  })

  it('maps defaultCurrency from Currency', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBe('USD')
  })

  it('defaultLeadTimeDays is always undefined for sap-inventory adapter', () => {
    const result = transformSupplier(raw)
    expect(result.defaultLeadTimeDays).toBeUndefined()
  })

  it('maps email from EmailAddress', () => {
    const result = transformSupplier(raw)
    expect(result.email).toBe('orders@keyboards.example')
  })

  it('maps phone from PhoneNumber', () => {
    const result = transformSupplier(raw)
    expect(result.phone).toBe('+14155550199')
  })

  it('platform is sap-inventory', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('sap-inventory')
  })

  it('produces output satisfying SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
