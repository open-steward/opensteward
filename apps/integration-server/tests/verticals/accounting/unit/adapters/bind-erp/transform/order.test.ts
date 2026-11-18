import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import {
  transformOrder,
  transformSalesOrder,
  type BindOrderDetails,
} from '../../../../../../../src/verticals/accounting/adapters/bind-erp/transform/order'

function makeOrder(overrides: Partial<BindOrderDetails> = {}): BindOrderDetails {
  return {
    ID: 'order-1',
    ClientID: 'client-1',
    ClientName: 'Test Client',
    StatusCode: 1,
    Status: 'Abierto',
    OrderDate: '2024-08-01T00:00:00',
    CurrencyName: 'MXN',
    CurrencyID: 'MX',
    ProductSubtotal: 1000,
    ServiceSubtotal: 200,
    Discount: 50,
    VAT: 152,
    Total: 1302,
    Products: [
      { ProductID: 'p1', Name: 'Widget', Code: 'WGT', Qty: 4, Price: 250, IndexNumber: 0 },
    ],
    Services: [{ ServiceID: 's1', Name: 'Setup', Code: 'STP', Qty: 1, Price: 200, IndexNumber: 1 }],
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('prefers ID over Number for id', () => {
    expect(transformOrder(makeOrder()).id).toBe('order-1')
  })

  it('falls back to Number string when ID is absent', () => {
    expect(transformOrder(makeOrder({ ID: undefined, Number: 42 })).id).toBe('42')
  })

  it('type is always SALES', () => {
    expect(transformOrder(makeOrder()).type).toBe('SALES')
  })

  it('maps ClientID to contactId', () => {
    expect(transformOrder(makeOrder()).contactId).toBe('client-1')
  })

  it('prefers CurrencyName over CurrencyID', () => {
    expect(transformOrder(makeOrder()).currency).toBe('MXN')
  })

  it('falls back to CurrencyID when CurrencyName is absent', () => {
    expect(transformOrder(makeOrder({ CurrencyName: undefined })).currency).toBe('MX')
  })

  it('uses Total field directly for totalAmount when present', () => {
    expect(transformOrder(makeOrder()).totalAmount).toBe(1302)
  })

  it('computes total from subtotals when Total is absent', () => {
    // ProductSubtotal(1000) + ServiceSubtotal(200) - Discount(50) + VAT(152) = 1302
    const o = transformOrder(makeOrder({ Total: undefined }))
    expect(o.totalAmount).toBe(1302)
  })

  it('status is ACTIVE for StatusCode 1', () => {
    expect(transformOrder(makeOrder({ StatusCode: 1, Status: undefined })).status).toBe('ACTIVE')
  })

  it('status is ACTIVE for Status=Abierto', () => {
    expect(transformOrder(makeOrder({ StatusCode: undefined, Status: 'Abierto' })).status).toBe(
      'ACTIVE',
    )
  })

  it('status is ACTIVE for Status=Activo', () => {
    expect(transformOrder(makeOrder({ StatusCode: undefined, Status: 'Activo' })).status).toBe(
      'ACTIVE',
    )
  })

  it('status is CANCELLED for StatusCode 2', () => {
    expect(transformOrder(makeOrder({ StatusCode: 2, Status: undefined })).status).toBe('CANCELLED')
  })

  it('status is CANCELLED for Status=Cancelado', () => {
    expect(transformOrder(makeOrder({ StatusCode: undefined, Status: 'Cancelado' })).status).toBe(
      'CANCELLED',
    )
  })

  it('status is COMPLETED for StatusCode 3', () => {
    expect(transformOrder(makeOrder({ StatusCode: 3, Status: undefined })).status).toBe('COMPLETED')
  })

  it('status is COMPLETED for Status=Completado', () => {
    expect(transformOrder(makeOrder({ StatusCode: undefined, Status: 'Completado' })).status).toBe(
      'COMPLETED',
    )
  })

  it('status is COMPLETED for Status=Facturado', () => {
    expect(transformOrder(makeOrder({ StatusCode: undefined, Status: 'Facturado' })).status).toBe(
      'COMPLETED',
    )
  })

  it('status defaults to DRAFT for unknown code and status', () => {
    expect(transformOrder(makeOrder({ StatusCode: undefined, Status: undefined })).status).toBe(
      'DRAFT',
    )
  })

  it('combines Products and Services into lineItems', () => {
    const o = transformOrder(makeOrder())
    expect(o.lineItems).toHaveLength(2)
    expect(o.lineItems![0].itemId).toBe('p1')
    expect(o.lineItems![1].itemId).toBe('s1')
  })

  it('uses IndexNumber as line item id', () => {
    const o = transformOrder(makeOrder())
    expect(o.lineItems![0].id).toBe('0')
    expect(o.lineItems![1].id).toBe('1')
  })

  it('maps OrderDate to postedAt', () => {
    expect(transformOrder(makeOrder()).postedAt).toEqual(new Date('2024-08-01T00:00:00'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrder()
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('transformSalesOrder', () => {
  it('maps same id logic as transformOrder', () => {
    expect(transformSalesOrder(makeOrder()).id).toBe('order-1')
  })

  it('does NOT set a type field (SalesOrder schema has no type)', () => {
    const so = transformSalesOrder(makeOrder()) as Record<string, unknown>
    expect(so['type']).toBeUndefined()
  })

  it('maps ClientID to contactId', () => {
    expect(transformSalesOrder(makeOrder()).contactId).toBe('client-1')
  })

  it('status is ACTIVE for StatusCode 1', () => {
    expect(transformSalesOrder(makeOrder({ StatusCode: 1, Status: undefined })).status).toBe(
      'ACTIVE',
    )
  })

  it('status is CANCELLED for StatusCode 2', () => {
    expect(transformSalesOrder(makeOrder({ StatusCode: 2, Status: undefined })).status).toBe(
      'CANCELLED',
    )
  })

  it('status is COMPLETED for StatusCode 3', () => {
    expect(transformSalesOrder(makeOrder({ StatusCode: 3, Status: undefined })).status).toBe(
      'COMPLETED',
    )
  })

  it('status defaults to DRAFT when no code or status', () => {
    expect(
      transformSalesOrder(makeOrder({ StatusCode: undefined, Status: undefined })).status,
    ).toBe('DRAFT')
  })

  it('uses Total for totalAmount', () => {
    expect(transformSalesOrder(makeOrder()).totalAmount).toBe(1302)
  })

  it('combines Products and Services into lineItems', () => {
    const so = transformSalesOrder(makeOrder())
    expect(so.lineItems).toHaveLength(2)
  })

  it('maps OrderDate to postedAt', () => {
    expect(transformSalesOrder(makeOrder()).postedAt).toEqual(new Date('2024-08-01T00:00:00'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })
})
