import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawInvenTreePurchaseOrder,
  type RawInvenTreePOLine,
} from '../../../../../../../src/verticals/inventory/adapters/inventree/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('transformPurchaseOrder — inventree', () => {
  const rawPO: RawInvenTreePurchaseOrder = {
    pk: 1,
    reference: 'PO-0001',
    supplier: 10,
    supplier_name: 'Acme Corp',
    status: 20, // placed → sent
    status_text: 'Placed',
    creation_date: '2024-03-01',
    issue_date: '2024-03-01T00:00:00Z',
    target_date: '2024-04-01T00:00:00Z',
    complete_date: null,
    total_price: '500.00',
    order_currency: 'USD',
    line_items: 1,
    completed_lines: 0,
    overdue: false,
  }
  const rawLines: RawInvenTreePOLine[] = [
    {
      pk: 100,
      internal_part: 42,
      internal_part_name: 'Widget v2',
      sku: 'WDG-001',
      quantity: 50,
      received: 0,
      purchase_price: '10.00',
      total_price: '500.00',
    },
  ]
  const result = transformPurchaseOrder(rawPO, rawLines)

  it('sets id from pk', () => {
    expect(result.id).toBe('1')
  })

  it('sets number from reference', () => {
    expect(result.number).toBe('PO-0001')
  })

  it('maps status 20 (placed) → sent', () => {
    expect(result.status).toBe('sent')
  })

  it('sets supplierId from supplier', () => {
    expect(result.supplierId).toBe('10')
  })

  it('maps line productId from internal_part', () => {
    expect(result.lines[0]?.productId).toBe('42')
  })

  it('maps line quantityOrdered', () => {
    expect(result.lines[0]?.quantityOrdered).toBe(50)
  })

  it('sets platform to inventree', () => {
    expect(result.platform).toBe('inventree')
  })

  it('passes schema validation', () => {
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})

describe('transformPurchaseOrder — status mapping', () => {
  const makeRaw = (status: number): RawInvenTreePurchaseOrder => ({
    pk: 9,
    supplier: 1,
    status,
  })

  it('maps status 10 (pending) → draft', () => {
    expect(transformPurchaseOrder(makeRaw(10)).status).toBe('draft')
  })

  it('maps status 30 (complete) → received', () => {
    expect(transformPurchaseOrder(makeRaw(30)).status).toBe('received')
  })

  it('maps status 40 (cancelled) → cancelled', () => {
    expect(transformPurchaseOrder(makeRaw(40)).status).toBe('cancelled')
  })

  it('maps unknown status → draft', () => {
    expect(transformPurchaseOrder(makeRaw(999)).status).toBe('draft')
  })
})
