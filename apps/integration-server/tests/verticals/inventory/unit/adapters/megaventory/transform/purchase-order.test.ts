import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawMegaventoryPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/megaventory/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

/** Copied from the live `PurchaseOrderGet` metadata example, 2026-09-18. */
function raw(over: Partial<RawMegaventoryPurchaseOrder> = {}): RawMegaventoryPurchaseOrder {
  return {
    PurchaseOrderId: 49411,
    PurchaseOrderNo: '62',
    PurchaseOrderStatus: 'Pending',
    PurchaseOrderDate: '/Date(1531342800000-0000)/',
    PurchaseOrderCurrencyCode: 'USD',
    PurchaseOrderSupplierID: 5357,
    PurchaseOrderInventoryLocationID: 4,
    PurchaseOrderTotalQuantity: 10,
    PurchaseOrderAmountSubtotalWithoutTaxAndDiscount: 120.5,
    PurchaseOrderAmountGrandTotal: 145.99,
    PurchaseOrderDetails: [
      {
        PurchaseOrderRowDetailID: 76069,
        PurchaseOrderRowProductID: 27412,
        PurchaseOrderRowQuantity: 10,
        PurchaseOrderRowReceivedQuantity: 0,
        PurchaseOrderRowUnitPriceWithoutTaxOrDiscount: 12.05,
        PurchaseOrderRowTotalAmount: 120.5,
        PurchaseOrderRowExpectedReceivingDateEarliest: '/Date(1531688400000-0000)/',
      },
    ],
    ...over,
  }
}

describe('megaventory purchase orders', () => {
  it('produces canonical output that satisfies the schema', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(raw()))).not.toThrow()
  })

  it('scales decimal major units into integer minor units', () => {
    // Megaventory reports 145.99 USD; canonical Money is integer minor units.
    // Passing the decimal straight through under-reports by 100x.
    const po = transformPurchaseOrder(raw())
    expect(po.totalAmount).toBe(14599)
    expect(po.subtotalAmount).toBe(12050)
    expect(po.lines[0]!.unitCost).toBe(1205)
    expect(po.lines[0]!.lineTotal).toBe(12050)
  })

  it('scales by the order currency exponent, not always by 100', () => {
    // JPY has no minor unit, so 145 JPY is 145 — not 14500.
    const po = transformPurchaseOrder(
      raw({ PurchaseOrderCurrencyCode: 'JPY', PurchaseOrderAmountGrandTotal: 145 }),
    )
    expect(po.currency).toBe('JPY')
    expect(po.totalAmount).toBe(145)
  })

  it('maps identity, supplier and destination', () => {
    const po = transformPurchaseOrder(raw())
    expect(po.id).toBe('49411')
    expect(po.number).toBe('62')
    expect(po.supplierId).toBe('5357')
    expect(po.destinationLocationId).toBe('4')
  })

  it('omits the sentinel zero location rather than pointing at location 0', () => {
    expect(
      transformPurchaseOrder(raw({ PurchaseOrderInventoryLocationID: 0 })).destinationLocationId,
    ).toBeUndefined()
  })

  it('reports an unreceived Pending order as sent', () => {
    expect(transformPurchaseOrder(raw()).status).toBe('sent')
  })

  it('derives partially_received from the row quantities', () => {
    const po = transformPurchaseOrder(
      raw({
        PurchaseOrderDetails: [
          { PurchaseOrderRowProductID: 1, PurchaseOrderRowQuantity: 10, PurchaseOrderRowReceivedQuantity: 4 },
        ],
      }),
    )
    expect(po.status).toBe('partially_received')
  })

  it('derives received when every line has landed', () => {
    const po = transformPurchaseOrder(
      raw({
        PurchaseOrderDetails: [
          { PurchaseOrderRowProductID: 1, PurchaseOrderRowQuantity: 10, PurchaseOrderRowReceivedQuantity: 10 },
          { PurchaseOrderRowProductID: 2, PurchaseOrderRowQuantity: 5, PurchaseOrderRowReceivedQuantity: 5 },
        ],
      }),
    )
    expect(po.status).toBe('received')
  })

  it('trusts the quantities over the status string', () => {
    // A fully received order is received even while Megaventory still calls
    // it Pending — the quantities are unambiguous and the status enum is not
    // documented.
    const po = transformPurchaseOrder(
      raw({
        PurchaseOrderStatus: 'Pending',
        PurchaseOrderDetails: [
          { PurchaseOrderRowProductID: 1, PurchaseOrderRowQuantity: 3, PurchaseOrderRowReceivedQuantity: 3 },
        ],
      }),
    )
    expect(po.status).toBe('received')
  })

  it('reports an undocumented status as unknown rather than guessing', () => {
    // The full enum is not published and could not be enumerated from the
    // live metadata, so a state with nothing received and an unfamiliar label
    // is reported as unknown; the true value stays on raw.
    const po = transformPurchaseOrder(raw({ PurchaseOrderStatus: 'SomethingElse' }))
    expect(po.status).toBe('unknown')
    expect(po.raw).toMatchObject({ PurchaseOrderStatus: 'SomethingElse' })
  })

  it('drops a line that references no product', () => {
    const po = transformPurchaseOrder(
      raw({ PurchaseOrderDetails: [{ PurchaseOrderRowQuantity: 5 }] }),
    )
    expect(po.lines).toEqual([])
  })

  it('converts .NET dates and takes the earliest expected receiving date', () => {
    const po = transformPurchaseOrder(raw())
    expect(po.orderedAt).toBe('2018-07-11T21:00:00.000Z')
    expect(po.expectedAt).toBe('2018-07-15T21:00:00.000Z')
  })
})
