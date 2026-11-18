import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawPeoplevoxPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/peoplevox/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('transformPurchaseOrder — peoplevox', () => {
  const raw: RawPeoplevoxPurchaseOrder = {
    PurchaseOrderNumber: 'PO-2024-001',
    Status: 'submitted',
    Reference: 'REF-001',
    Supplier: 'ACME Corp',
    AddressCity: 'London',
    AddressCountry: 'GB',
    ExpectedDeliveryDate: '2024-03-01T00:00:00Z',
    SubmittedDate: '2024-03-01T00:00:00Z',
    User: 'jane.doe',
    Lines: [
      {
        ItemCode: 'WK-2026',
        Quantity: '10',
        CostPrice: '45.99',
      },
    ],
  }
  const result = transformPurchaseOrder(raw)

  it('maps id from PurchaseOrderNumber', () => {
    expect(result.id).toBe('PO-2024-001')
  })

  it('maps number from PurchaseOrderNumber', () => {
    expect(result.number).toBe('PO-2024-001')
  })

  it('maps supplierId from Supplier', () => {
    expect(result.supplierId).toBe('ACME Corp')
  })

  it('maps status: sent from "submitted"', () => {
    expect(result.status).toBe('sent')
  })

  it('maps line productId from ItemCode', () => {
    expect(result.lines[0]!.productId).toBe('WK-2026')
  })

  it('maps line quantityOrdered from Quantity', () => {
    expect(result.lines[0]!.quantityOrdered).toBe(10)
  })

  it('converts line CostPrice to integer minor units (*100)', () => {
    expect(result.lines[0]!.unitCost).toBe(4599)
  })

  it('maps expectedAt from ExpectedDeliveryDate', () => {
    expect(result.expectedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps orderedAt from SubmittedDate', () => {
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to peoplevox', () => {
    expect(result.platform).toBe('peoplevox')
  })

  it('stores user in metadata', () => {
    expect(result.metadata['user']).toBe('jane.doe')
  })

  it('passes schema validation', () => {
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})

describe('transformPurchaseOrder — peoplevox status mapping', () => {
  const cases: Array<[string, string]> = [
    ['new', 'draft'],
    ['draft', 'draft'],
    ['approved', 'sent'],
    ['ordered', 'sent'],
    ['partial', 'partially_received'],
    ['partially received', 'partially_received'],
    ['received', 'received'],
    ['complete', 'received'],
    ['closed', 'closed'],
    ['cancelled', 'cancelled'],
    ['canceled', 'cancelled'],
  ]

  for (const [input, expected] of cases) {
    it(`maps status "${input}" → "${expected}"`, () => {
      const raw: RawPeoplevoxPurchaseOrder = {
        PurchaseOrderNumber: 'PO-1',
        Status: input,
        Supplier: 'S',
        Lines: [],
      }
      expect(transformPurchaseOrder(raw).status).toBe(expected)
    })
  }
})

describe('transformPurchaseOrder — peoplevox empty lines', () => {
  const raw: RawPeoplevoxPurchaseOrder = {
    PurchaseOrderNumber: 'PO-EMPTY',
    Supplier: 'Vendor X',
  }
  const result = transformPurchaseOrder(raw)

  it('returns empty lines array when Lines absent', () => {
    expect(result.lines).toEqual([])
  })

  it('passes schema validation', () => {
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
