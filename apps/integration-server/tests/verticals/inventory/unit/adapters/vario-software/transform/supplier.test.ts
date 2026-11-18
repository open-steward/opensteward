import { describe, it, expect } from 'vitest'
import {
  transformSupplier,
  type RawVarioArticleSupplier,
} from '../../../../../../../src/verticals/inventory/adapters/vario-software/transform/supplier'
import { SupplierSchema } from '../../../../../../../src/verticals/inventory/schema/supplier'

const baseRaw: RawVarioArticleSupplier = {
  id: 'as-001',
  accountId: 'acc-42',
  accountDisplayName: 'Keyboards Inc',
  articleId: 'art-001',
  articleNumber: 'WK-2026',
  active: true,
  mainSupplier: true,
  supplierArticleNumber: 'SUP-WK-2026',
  deliveryTime: 14,
  minimumOrderQuantity: 10,
  defaultNetPrice: 24.99,
}

describe('vario-software transformSupplier', () => {
  it('maps id from accountId', () => {
    expect(transformSupplier(baseRaw).id).toBe('acc-42')
  })

  it('falls back to id field when accountId absent', () => {
    const result = transformSupplier({ ...baseRaw, accountId: undefined })
    expect(result.id).toBe('as-001')
  })

  it('maps name from accountDisplayName', () => {
    expect(transformSupplier(baseRaw).name).toBe('Keyboards Inc')
  })

  it('maps defaultLeadTimeDays from deliveryTime', () => {
    expect(transformSupplier(baseRaw).defaultLeadTimeDays).toBe(14)
  })

  it('maps isActive from active flag', () => {
    expect(transformSupplier(baseRaw).isActive).toBe(true)
    expect(transformSupplier({ ...baseRaw, active: false }).isActive).toBe(false)
  })

  it('has no email or phone (not on article-supplier relation)', () => {
    const result = transformSupplier(baseRaw)
    expect(result.email).toBeUndefined()
    expect(result.phone).toBeUndefined()
  })

  it('has no defaultCurrency (not on article-supplier relation)', () => {
    expect(transformSupplier(baseRaw).defaultCurrency).toBeUndefined()
  })

  it('sets platform to vario-software', () => {
    expect(transformSupplier(baseRaw).platform).toBe('vario-software')
  })

  it('produces output that satisfies SupplierSchema', () => {
    expect(() => SupplierSchema.parse(transformSupplier(baseRaw))).not.toThrow()
  })
})
