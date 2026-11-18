/**
 * Norce `transformOrder` — maps Commerce Query's `Orders/Orders` entity to
 * the canonical Order shape. Field names per the published OpenAPI schema
 * for `...OrderModel.Order`:
 * https://docs.norce.io/api-reference/query/queryorders/openapi
 */
import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'
import {
  transformOrder,
  type RawNorceOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/norce/transform/order'

describe('Norce transformOrder', () => {
  it('produces output that satisfies the canonical Order schema', () => {
    const out = transformOrder({
      Id: 'ord-1042',
      OrderNo: '1042',
      OrderDate: '2026-01-15T09:30:00Z',
      Created: '2026-01-15T09:30:00Z',
      Updated: '2026-02-01T14:20:00Z',
      BuyerCustomerId: 7,
    })
    expect(() => OrderSchema.parse(out)).not.toThrow()
  })

  it('minimal input still satisfies the schema', () => {
    const out = transformOrder({ Id: 'ord-min' })
    expect(() => OrderSchema.parse(out)).not.toThrow()
  })

  it('maps id/orderNumber/name from Id and OrderNo', () => {
    const out = transformOrder({ Id: 'ord-1', OrderNo: '#1' })
    expect(out.id).toBe('ord-1')
    expect(out.orderNumber).toBe('#1')
    expect(out.name).toBe('#1')
  })

  it('prefers BuyerCustomerId over PayerCustomerId for customerId', () => {
    expect(transformOrder({ Id: 'o1', BuyerCustomerId: 1, PayerCustomerId: 2 }).customerId).toBe('1')
  })

  it('falls back to PayerCustomerId when BuyerCustomerId is absent', () => {
    expect(transformOrder({ Id: 'o2', PayerCustomerId: 2 }).customerId).toBe('2')
  })

  it('converts OrderDate/Created/Updated to ISO 8601', () => {
    const out = transformOrder({ Id: 'o3', OrderDate: '2026-01-15T09:30:00Z' })
    expect(out.processedAt).toBe('2026-01-15T09:30:00.000Z')
  })

  it('preserves the raw record in metadata', () => {
    const raw: RawNorceOrder = { Id: 'o4' }
    expect(transformOrder(raw).metadata).toBe(raw)
  })

  it('does not throw on missing optional fields', () => {
    expect(() => transformOrder({ Id: '' })).not.toThrow()
  })
})
