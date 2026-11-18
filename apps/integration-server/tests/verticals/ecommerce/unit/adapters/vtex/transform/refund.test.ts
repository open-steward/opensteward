import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawVtexReturnRequest,
} from '../../../../../../../src/verticals/ecommerce/adapters/vtex/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeReturnRequest(overrides: Partial<RawVtexReturnRequest> = {}): RawVtexReturnRequest {
  return {
    id: 'RET-001',
    orderId: 'ORD-1001-01',
    refundableAmount: 9990,
    status: 'amountRefunded',
    userComment: 'Product arrived damaged',
    createdIn: '2024-06-01T00:00:00.000Z',
    lastChange: '2024-06-03T10:00:00.000Z',
    cultureInfoData: { locale: 'pt-BR', currencyCode: 'BRL' },
    items: [
      { orderItemIndex: 0, localId: 'LI-001', quantity: 1 },
      { orderItemIndex: 1, quantity: 2 },
    ],
    ...overrides,
  }
}

describe('transformRefund', () => {
  it('maps core fields', () => {
    const result = transformRefund(makeReturnRequest())
    expect(result.id).toBe('RET-001')
    expect(result.orderId).toBe('ORD-1001-01')
    expect(result.reason).toBe('Product arrived damaged')
    expect(result.restock).toBe(true)
  })

  it('maps refundable amount in integer minor units', () => {
    const result = transformRefund(makeReturnRequest())
    expect(result.amount).toEqual({ amount: 9990, currency: 'BRL' })
  })

  it('uses currencyCode from cultureInfoData', () => {
    const result = transformRefund(makeReturnRequest())
    expect(result.amount?.currency).toBe('BRL')
  })

  it('defaults currency to BRL when cultureInfoData absent', () => {
    const result = transformRefund(makeReturnRequest({ cultureInfoData: null }))
    expect(result.amount?.currency).toBe('BRL')
  })

  it('accepts an explicit currency override parameter', () => {
    const result = transformRefund(makeReturnRequest({ cultureInfoData: null }), 'USD')
    expect(result.amount?.currency).toBe('USD')
  })

  it('maps refundLineItems from items array', () => {
    const result = transformRefund(makeReturnRequest())
    expect(result.refundLineItems).toHaveLength(2)
    // Item with localId uses localId as lineItemId
    expect(result.refundLineItems![0]!.lineItemId).toBe('LI-001')
    expect(result.refundLineItems![0]!.quantity).toBe(1)
    // Item without localId uses index
    expect(result.refundLineItems![1]!.lineItemId).toBe('1')
    expect(result.refundLineItems![1]!.quantity).toBe(2)
  })

  it('maps processedAt and createdAt via toIsoDatetime', () => {
    const result = transformRefund(makeReturnRequest())
    expect(result.processedAt).toBe('2024-06-03T10:00:00.000Z')
    expect(result.createdAt).toBe('2024-06-01T00:00:00.000Z')
  })

  it('omits amount when refundableAmount is null', () => {
    const result = transformRefund(makeReturnRequest({ refundableAmount: null }))
    expect(result.amount).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeReturnRequest()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const result = transformRefund(makeReturnRequest())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

describe('untransformRefund', () => {
  it('round-trips orderId and reason', () => {
    const canonical = transformRefund(makeReturnRequest())
    const raw = untransformRefund(canonical)
    expect(raw['orderId']).toBe('ORD-1001-01')
    expect(raw['userComment']).toBe('Product arrived damaged')
  })

  it('maps refundLineItems back to VTEX items with orderItemIndex and quantity', () => {
    const canonical = transformRefund(makeReturnRequest())
    const raw = untransformRefund(canonical)
    const items = raw['items'] as Array<Record<string, unknown>>
    expect(items).toHaveLength(2)
    expect(items[0]).toEqual({ orderItemIndex: 0, quantity: 1 })
    expect(items[1]).toEqual({ orderItemIndex: 1, quantity: 2 })
  })

  it('omits items when no refundLineItems', () => {
    // untransformRefund uses optional chaining: refundLineItems?.map(...)
    // so items is undefined when refundLineItems is absent
    const raw = untransformRefund({ orderId: 'ORD-001' })
    expect(raw['items']).toBeUndefined()
  })
})
