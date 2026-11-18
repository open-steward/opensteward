import { describe, it, expect } from 'vitest'
import {
  transformSalesOrder,
  type AbacusSalesOrder,
} from '../../../../../../../src/verticals/accounting/adapters/abacus-ch/transform/salesorder'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'

function makeAbacusSalesOrder(overrides: Partial<AbacusSalesOrder> = {}): AbacusSalesOrder {
  return {
    Id: '5001',
    Status: 'active',
    CustomerId: '200',
    AccountId: '4000',
    CurrencyCode: 'CHF',
    TotalAmount: 300.0,
    SalesChannel: 'web',
    OrderDate: '2024-03-01',
    Positions: [
      {
        Id: '1',
        ArticleId: '10',
        ArticleNumber: 'SKU-A',
        Description: 'Product A',
        Quantity: 3,
        UnitPrice: 100.0,
        TotalPrice: 300.0,
        TaxAmount: 23.1,
        DiscountAmount: 0,
      },
    ],
    BillingAddress: {
      Street: 'Main St 1',
      City: 'Bern',
      PostalCode: '3001',
      CountryCode: 'CH',
    },
    CreatedAt: '2024-03-01T00:00:00.000Z',
    ModifiedAt: '2024-03-10T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformSalesOrder (abacus-ch)', () => {
  it('maps Id as string', () => {
    expect(transformSalesOrder(makeAbacusSalesOrder({ Id: 5001 })).id).toBe('5001')
  })

  it('maps CustomerId to contactId and AccountId to accountId', () => {
    const result = transformSalesOrder(makeAbacusSalesOrder())
    expect(result.contactId).toBe('200')
    expect(result.accountId).toBe('4000')
  })

  it('maps "active" status to ACTIVE', () => {
    expect(transformSalesOrder(makeAbacusSalesOrder({ Status: 'active' })).status).toBe('ACTIVE')
  })

  it('maps "offen" to ACTIVE', () => {
    expect(transformSalesOrder(makeAbacusSalesOrder({ Status: 'offen' })).status).toBe('ACTIVE')
  })

  it('maps "draft" to DRAFT', () => {
    expect(transformSalesOrder(makeAbacusSalesOrder({ Status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps "entwurf" to DRAFT', () => {
    expect(transformSalesOrder(makeAbacusSalesOrder({ Status: 'entwurf' })).status).toBe('DRAFT')
  })

  it('maps "completed" to COMPLETED', () => {
    expect(transformSalesOrder(makeAbacusSalesOrder({ Status: 'completed' })).status).toBe(
      'COMPLETED',
    )
  })

  it('maps "abgeschlossen" to COMPLETED', () => {
    expect(transformSalesOrder(makeAbacusSalesOrder({ Status: 'abgeschlossen' })).status).toBe(
      'COMPLETED',
    )
  })

  it('maps "cancelled" to CANCELLED', () => {
    expect(transformSalesOrder(makeAbacusSalesOrder({ Status: 'cancelled' })).status).toBe(
      'CANCELLED',
    )
  })

  it('maps "storniert" to CANCELLED', () => {
    expect(transformSalesOrder(makeAbacusSalesOrder({ Status: 'storniert' })).status).toBe(
      'CANCELLED',
    )
  })

  it('converts TotalAmount to minor units', () => {
    expect(transformSalesOrder(makeAbacusSalesOrder({ TotalAmount: 300.0 })).totalAmount).toBe(
      30000,
    )
  })

  it('maps billingAddress', () => {
    const result = transformSalesOrder(makeAbacusSalesOrder())
    expect(result.billingAddress?.city).toBe('Bern')
    expect(result.billingAddress?.country).toBe('CH')
  })

  it('maps SalesChannel', () => {
    expect(transformSalesOrder(makeAbacusSalesOrder()).salesChannel).toBe('web')
  })

  it('maps line items with minor-unit conversion', () => {
    const result = transformSalesOrder(makeAbacusSalesOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.itemSku).toBe('SKU-A')
    expect(li.unitAmount).toBe(10000) // 100.0 * 100
    expect(li.totalAmount).toBe(30000) // 300.0 * 100
  })

  it('maps OrderDate to postedAt', () => {
    expect(transformSalesOrder(makeAbacusSalesOrder()).postedAt).toBeInstanceOf(Date)
  })

  it('passes SalesOrderSchema.parse without throwing', () => {
    const result = transformSalesOrder(makeAbacusSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
