import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawVarioOrderProposal,
} from '../../../../../../../src/verticals/inventory/adapters/vario-software/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

const baseRaw: RawVarioOrderProposal = {
  id: 'op-001',
  version: '1',
  processed: false,
  supplierPreference: 'cheapest',
  orderProposalSuppliers: [
    {
      id: 'ops-1',
      accountId: 'acc-42',
      accountRef: { id: 'acc-42', displayName: 'Keyboards Inc' },
    },
  ],
  orderProposalLines: [
    {
      id: 'opl-1',
      articleRef: { id: 'art-001', displayName: 'Wireless Keyboard' },
      proposedOrderAmount: 100,
      toBeOrderedAmount: 80,
      negotiatedUnitPrice: 2499,
      determinedUnitPrice: 2600,
    },
  ],
  info: { createdAt: '2024-03-01T00:00:00Z', updatedAt: '2024-03-01T00:00:00Z' },
}

describe('vario-software transformPurchaseOrder', () => {
  it('maps id from id field', () => {
    expect(transformPurchaseOrder(baseRaw).id).toBe('op-001')
  })

  it('maps supplierId from first orderProposalSupplier accountId', () => {
    expect(transformPurchaseOrder(baseRaw).supplierId).toBe('acc-42')
  })

  it('maps status to draft when processed is false', () => {
    expect(transformPurchaseOrder(baseRaw).status).toBe('draft')
  })

  it('maps status to closed when processed is true', () => {
    expect(transformPurchaseOrder({ ...baseRaw, processed: true }).status).toBe('closed')
  })

  it('maps lines with productId from articleRef.id', () => {
    const result = transformPurchaseOrder(baseRaw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('art-001')
  })

  it('prefers toBeOrderedAmount over proposedOrderAmount for quantityOrdered', () => {
    const result = transformPurchaseOrder(baseRaw)
    expect(result.lines[0]!.quantityOrdered).toBe(80)
  })

  it('prefers negotiatedUnitPrice over determinedUnitPrice for unitCost', () => {
    const result = transformPurchaseOrder(baseRaw)
    expect(result.lines[0]!.unitCost).toBe(2499)
  })

  it('maps orderedAt from info.createdAt', () => {
    const result = transformPurchaseOrder(baseRaw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to vario-software', () => {
    expect(transformPurchaseOrder(baseRaw).platform).toBe('vario-software')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(baseRaw))).not.toThrow()
  })
})
