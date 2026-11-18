import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawSapEwmSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/sap-ewm/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

describe('sap-ewm transformSupplier', () => {
  const raw: RawSapEwmSupplier = {
    Supplier: 'SUP001',
    PurchaseOrderCurrency: 'USD',
    PlannedDeliveryDurationInDays: 14,
    IsMarkedForDeletion: false,
    to_BusinessPartner: {
      BusinessPartnerFullName: 'Keyboards Inc',
      OrganizationBPName1: 'Keyboards Inc Ltd',
      Country: 'US',
    },
  }

  it('maps id from Supplier', () => {
    const result = transformSupplier(raw)
    expect(result.id).toBe('SUP001')
  })

  it('prefers BusinessPartnerFullName from to_BusinessPartner', () => {
    const result = transformSupplier(raw)
    expect(result.name).toBe('Keyboards Inc')
  })

  it('falls back to OrganizationBPName1 when BusinessPartnerFullName absent', () => {
    const result = transformSupplier({
      ...raw,
      to_BusinessPartner: { OrganizationBPName1: 'Keyboards Inc Ltd' },
    })
    expect(result.name).toBe('Keyboards Inc Ltd')
  })

  it('falls back to flat BusinessPartnerFullName field when nav-prop absent', () => {
    const result = transformSupplier({
      Supplier: 'SUP002',
      BusinessPartnerFullName: 'Flat Name Co',
    })
    expect(result.name).toBe('Flat Name Co')
  })

  it('falls back name to Supplier number when all name fields absent', () => {
    const result = transformSupplier({ Supplier: 'SUP003' })
    expect(result.name).toBe('SUP003')
  })

  it('IsMarkedForDeletion false → isActive true', () => {
    const result = transformSupplier(raw)
    expect(result.isActive).toBe(true)
  })

  it('IsMarkedForDeletion "X" → isActive false', () => {
    const result = transformSupplier({ ...raw, IsMarkedForDeletion: 'X' })
    expect(result.isActive).toBe(false)
  })

  it('IsMarkedForDeletion true → isActive false', () => {
    const result = transformSupplier({ ...raw, IsMarkedForDeletion: true })
    expect(result.isActive).toBe(false)
  })

  it('maps defaultCurrency from PurchaseOrderCurrency', () => {
    const result = transformSupplier(raw)
    expect(result.defaultCurrency).toBe('USD')
  })

  it('maps defaultLeadTimeDays from PlannedDeliveryDurationInDays', () => {
    const result = transformSupplier(raw)
    expect(result.defaultLeadTimeDays).toBe(14)
  })

  it('handles to_BusinessPartner as results array wrapper', () => {
    const result = transformSupplier({
      ...raw,
      to_BusinessPartner: { results: [{ BusinessPartnerFullName: 'Array Corp' }] },
    })
    expect(result.name).toBe('Array Corp')
  })

  it('platform is sap-ewm', () => {
    const result = transformSupplier(raw)
    expect(result.platform).toBe('sap-ewm')
  })

  it('produces output satisfying SupplierSchema', () => {
    const result = transformSupplier(raw)
    expect(() => SupplierSchema.parse(result)).not.toThrow()
  })
})
