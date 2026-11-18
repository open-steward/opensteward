import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawSapReturnRequest,
} from '../../../../../../../src/verticals/ecommerce/adapters/sap-commerce/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeReturnRequest(overrides: Partial<RawSapReturnRequest> = {}): RawSapReturnRequest {
  return {
    code: 'RET-001',
    rma: 'RMA-001',
    status: 'APPROVAL_PENDING',
    order: { code: 'ORD-10001' },
    returnEntries: [
      {
        orderEntry: { entryNumber: 0 },
        expectedQuantity: 1,
        refundAmount: { value: 1499.99, currencyIso: 'EUR' },
        action: 'REFUND',
      },
    ],
    creationTime: '2024-06-10T08:00:00.000Z',
    ...overrides,
  }
}

describe('transformRefund (sap-commerce)', () => {
  it('maps core fields', () => {
    const r = transformRefund(makeReturnRequest(), 'ORD-10001')
    expect(r.id).toBe('RMA-001')
    expect(r.orderId).toBe('ORD-10001')
    expect(r.reason).toBe('APPROVAL_PENDING')
  })

  it('computes total refund amount from entries', () => {
    const r = transformRefund(makeReturnRequest())
    expect(r.amount).toEqual({ amount: 149999, currency: 'EUR' })
  })

  it('maps refund line items', () => {
    const r = transformRefund(makeReturnRequest())
    expect(r.refundLineItems).toHaveLength(1)
    expect(r.refundLineItems![0]!.lineItemId).toBe('0')
    expect(r.refundLineItems![0]!.quantity).toBe(1)
  })

  it('uses order code from raw when orderId not provided', () => {
    const r = transformRefund(makeReturnRequest())
    expect(r.orderId).toBe('ORD-10001')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeReturnRequest()
    const r = transformRefund(raw)
    expect(r.metadata).toBe(raw)
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const r = transformRefund(makeReturnRequest(), 'ORD-10001')
    expect(() => RefundSchema.parse(r)).not.toThrow()
  })
})

describe('untransformRefund (sap-commerce)', () => {
  it('builds return request body', () => {
    const body = untransformRefund({
      orderId: 'ORD-10001',
      refundLineItems: [
        { lineItemId: '0', quantity: 1 },
      ],
    }) as Record<string, unknown>
    const entries = body['returnEntries'] as Array<Record<string, unknown>>
    expect(entries).toHaveLength(1)
    expect(entries[0]!['action']).toBe('REFUND')
  })
})
