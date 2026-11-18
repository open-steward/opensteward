import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type AccounteerPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/accounteer/transform/purchaseorder'

function makeRaw(overrides: Partial<AccounteerPurchaseOrder> = {}): AccounteerPurchaseOrder {
  return { id: '1', ...overrides }
}

describe('accounteer transformPurchaseOrder', () => {
  it('maps id', () => {
    expect(transformPurchaseOrder(makeRaw()).id).toBe('1')
  })
  it('handles missing optional fields gracefully', () => {
    expect(() => transformPurchaseOrder(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })
  it('maps status active -> ACTIVE', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'active' })).status).toBe('ACTIVE')
  })
  it('maps status completed -> COMPLETED', () => {
    expect(transformPurchaseOrder(makeRaw({ status: 'completed' })).status).toBe('COMPLETED')
  })
  it('maps date to postedAt as Date', () => {
    const result = transformPurchaseOrder(makeRaw({ date: '2024-07-01' }))
    expect(result.postedAt).toEqual(new Date('2024-07-01'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
