import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawDatapelInwardOrder,
} from '../../../../../../../src/verticals/inventory/adapters/datapel/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('datapel transformPurchaseOrder', () => {
  const raw: RawDatapelInwardOrder = {
    inwardorderid: 200,
    ordernumber: 'PO-200',
    supplierid: 55,
    suppliername: 'Top Supplier',
    status: 'ordered',
    locationid: 42,
    subtotal: 100,
    total: 110,
    currency: 'AUD',
    orderdate: '2024-03-01T00:00:00Z',
    expecteddate: '2024-03-15T00:00:00Z',
    lines: [
      {
        basestockid: 101,
        itemcode: 'WIDGET-001',
        orderedqty: 10,
        receivedqty: 0,
        unitcost: 10,
        linetotal: 100,
      },
    ],
  }

  it('maps id and externalId from inwardorderid', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('200')
    expect(result.externalId).toBe('200')
  })

  it('maps number from ordernumber', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-200')
  })

  it('maps supplierId from supplierid', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('55')
  })

  it('maps status ordered to sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps status draft to draft', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'draft' })
    expect(result.status).toBe('draft')
  })

  it('maps status partial to partially_received', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'partial' })
    expect(result.status).toBe('partially_received')
  })

  it('maps status received to received', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'received' })
    expect(result.status).toBe('received')
  })

  it('maps status closed to closed', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'closed' })
    expect(result.status).toBe('closed')
  })

  it('converts subtotalAmount to cents', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.subtotalAmount).toBe(10000)
  })

  it('converts totalAmount to cents', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBe(11000)
  })

  it('maps destinationLocationId from locationid', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('42')
  })

  it('maps lines with productId and quantities', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('101')
    expect(result.lines[0].quantityOrdered).toBe(10)
  })

  it('converts line unitCost to cents', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines[0].unitCost).toBe(1000)
  })

  it('sets platform to datapel', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('datapel')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
