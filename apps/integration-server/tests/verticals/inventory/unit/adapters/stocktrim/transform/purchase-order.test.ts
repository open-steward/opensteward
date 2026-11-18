import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawStockTrimPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/stocktrim/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('transformPurchaseOrder — stocktrim', () => {
  const raw: RawStockTrimPurchaseOrder = {
    referenceNumber: 'PO-1042',
    externalId: 'EXT-PO-01',
    clientReferenceNumber: 'CLIENT-REF-99',
    orderDate: '2024-03-01T00:00:00Z',
    fullyReceivedDate: '2024-03-01T00:00:00Z',
    status: 'SENT',
    supplier: { code: 'SUPP-10', name: 'Keyboards Inc' },
    location: { code: 'WH-SFO', name: 'SF Warehouse' },
    purchaseOrderLineItems: [
      {
        productId: 'PROD-001',
        quantity: 200,
        unitPrice: 25.0,
      },
    ],
  }
  const result = transformPurchaseOrder(raw)

  it('maps id from referenceNumber', () => {
    expect(result.id).toBe('PO-1042')
  })

  it('maps externalId from externalId field', () => {
    expect(result.externalId).toBe('EXT-PO-01')
  })

  it('maps number from referenceNumber', () => {
    expect(result.number).toBe('PO-1042')
  })

  it('maps supplierId from supplier.code', () => {
    expect(result.supplierId).toBe('SUPP-10')
  })

  it('maps destinationLocationId from location.code', () => {
    expect(result.destinationLocationId).toBe('WH-SFO')
  })

  it('maps status SENT to sent', () => {
    expect(result.status).toBe('sent')
  })

  it('maps line productId', () => {
    expect(result.lines[0]?.productId).toBe('PROD-001')
  })

  it('maps line quantityOrdered', () => {
    expect(result.lines[0]?.quantityOrdered).toBe(200)
  })

  it('converts line unitPrice float to integer minor units (cents)', () => {
    // 25.00 * 100 = 2500
    expect(result.lines[0]?.unitCost).toBe(2500)
  })

  it('maps orderedAt from orderDate', () => {
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from fullyReceivedDate', () => {
    expect(result.receivedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('stores clientReferenceNumber in metadata', () => {
    expect(result.metadata['clientReferenceNumber']).toBe('CLIENT-REF-99')
  })

  it('sets platform to stocktrim', () => {
    expect(result.platform).toBe('stocktrim')
  })

  it('passes schema validation', () => {
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})

describe('transformPurchaseOrder — stocktrim status mapping', () => {
  const base: RawStockTrimPurchaseOrder = {
    supplier: { code: 'S1' },
  }

  it.each([
    ['DRAFT', 'draft'],
    ['APPROVED', 'draft'],
    ['SENT', 'sent'],
    ['RECEIVED', 'received'],
    ['UNKNOWN', 'draft'],
  ] as const)('maps status "%s" to "%s"', (status, expected) => {
    const result = transformPurchaseOrder({ ...base, status })
    expect(result.status).toBe(expected)
  })
})

describe('transformPurchaseOrder — stocktrim fallback id', () => {
  const raw: RawStockTrimPurchaseOrder = {
    externalId: 'EXT-ONLY',
    supplier: { code: 'S1' },
  }
  const result = transformPurchaseOrder(raw)

  it('falls back id to externalId when referenceNumber absent', () => {
    expect(result.id).toBe('EXT-ONLY')
  })
})
