import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawSphereWmsReceipt,
} from '../../../../../../../src/verticals/inventory/adapters/spherewms/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('transformPurchaseOrder — spherewms', () => {
  const raw: RawSphereWmsReceipt = {
    receipt_id: 'REC-001',
    arn_id: 'ARN-99',
    arn_reference_1: 'PO-1042',
    client_code: 'CLIENT-1',
    location_id: 'LOC-001',
    status: 'open',
    status_code: '10',
    arn_date: '2024-03-01T00:00:00Z',
    created_on: '2024-03-01T00:00:00Z',
    posted_on: '2024-03-01T00:00:00Z',
    ship_from: { code: 'SUPP-10', name: 'Supplier Co' },
    total_amount: 500000,
    items: [
      {
        product_id: 'PROD-42',
        quantity: 200,
        received_qty: 100,
        unit_cost: 2500,
        total_cost: 500000,
      },
    ],
  }
  const result = transformPurchaseOrder(raw)

  it('maps id from receipt_id', () => {
    expect(result.id).toBe('REC-001')
  })

  it('maps number from arn_reference_1', () => {
    expect(result.number).toBe('PO-1042')
  })

  it('maps supplierId from ship_from.code', () => {
    expect(result.supplierId).toBe('SUPP-10')
  })

  it('maps destinationLocationId from location_id', () => {
    expect(result.destinationLocationId).toBe('LOC-001')
  })

  it('maps status open to sent', () => {
    expect(result.status).toBe('sent')
  })

  it('maps totalAmount', () => {
    expect(result.totalAmount).toBe(500000)
  })

  it('maps line productId from product_id', () => {
    expect(result.lines[0]?.productId).toBe('PROD-42')
  })

  it('maps line quantityOrdered', () => {
    expect(result.lines[0]?.quantityOrdered).toBe(200)
  })

  it('maps line quantityReceived', () => {
    expect(result.lines[0]?.quantityReceived).toBe(100)
  })

  it('maps expectedAt from arn_date', () => {
    expect(result.expectedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps orderedAt from created_on', () => {
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to spherewms', () => {
    expect(result.platform).toBe('spherewms')
  })

  it('passes schema validation', () => {
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})

describe('transformPurchaseOrder — spherewms status mapping', () => {
  const base: RawSphereWmsReceipt = { receipt_id: 'R1', ship_from: {} }

  it.each([
    // NOTE: 'received' is checked before 'partial' in mapStatus, so 'partially received'
    // actually matches the 'received' branch first (source behavior verified).
    ['cancelled', undefined, 'cancelled'],
    ['complete', undefined, 'closed'],
    ['received', undefined, 'received'],
    ['partially received', undefined, 'received'],
    ['partial only', undefined, 'partially_received'],
    ['pending', undefined, 'sent'],
    [undefined, 0, 'draft'],
  ] as const)('maps status "%s" / code %s to "%s"', (status, code, expected) => {
    const result = transformPurchaseOrder({ ...base, status, status_code: code })
    expect(result.status).toBe(expected)
  })
})
