/**
 * Shape verified against `components.schemas.CustomerOrder` on
 * https://128.koronacloud.com/web/api/v3/openapi.json. No `lineItems`, no
 * `financialStatus`/`fulfillmentStatus` — see the file's own doc comment.
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type KoronaCustomerOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/korona-pos/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeRaw(overrides: Partial<KoronaCustomerOrder> = {}): KoronaCustomerOrder {
  return {
    id: '55555555-5555-5555-5555-555555555555',
    number: '1042',
    comment: 'Leave at front desk',
    customer: { id: '22222222-2222-2222-2222-222222222222' },
    createTime: '2024-03-01T10:00:00+01:00',
    finishTime: '2024-03-02T10:00:00+01:00',
    ...overrides,
  }
}

describe('transformOrder (korona-pos)', () => {
  it('maps id, orderNumber, name, customerId, note', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('55555555-5555-5555-5555-555555555555')
    expect(result.orderNumber).toBe('1042')
    expect(result.name).toBe('#1042')
    expect(result.customerId).toBe('22222222-2222-2222-2222-222222222222')
    expect(result.note).toBe('Leave at front desk')
  })

  it('never populates lineItems or financial/fulfillment status — no verified shape exists', () => {
    const result = transformOrder(makeRaw())
    expect(result.lineItems).toBeUndefined()
    expect(result.financialStatus).toBeUndefined()
    expect(result.fulfillmentStatus).toBeUndefined()
  })

  it('normalises createTime/finishTime to strict ISO UTC', () => {
    const result = transformOrder(makeRaw())
    expect(result.createdAt).toBe('2024-03-01T09:00:00.000Z')
    expect(result.processedAt).toBe('2024-03-02T09:00:00.000Z')
  })

  it('produces a payload that satisfies OrderSchema', () => {
    expect(() => OrderSchema.parse(transformOrder(makeRaw()))).not.toThrow()
  })

  it('untransformOrder writes comment/customer/items without any price', () => {
    const body = untransformOrder({
      note: 'Gift wrap',
      customerId: '22222222-2222-2222-2222-222222222222',
      lineItems: [
        {
          id: 'li_1',
          productId: '44444444-4444-4444-4444-444444444444',
          title: 'Espresso Beans',
          quantity: 2,
          price: { amount: 1999, currency: 'USD' },
          metadata: {},
        },
      ],
    })
    expect(body).toEqual({
      comment: 'Gift wrap',
      customer: { id: '22222222-2222-2222-2222-222222222222' },
      items: [{ product: { id: '44444444-4444-4444-4444-444444444444' }, quantity: 2 }],
    })
  })
})
