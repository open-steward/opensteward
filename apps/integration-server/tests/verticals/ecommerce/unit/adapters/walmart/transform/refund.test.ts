import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawWalmartReturn,
} from '../../../../../../../src/verticals/ecommerce/adapters/walmart/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeReturn(overrides: Partial<RawWalmartReturn> = {}): RawWalmartReturn {
  return {
    returnOrderId: 'RET-2024050100001',
    customerOrderId: 'CO-987654321',
    returnOrderDate: '2024-05-03T10:00:00.000Z',
    status: 'COMPLETED',
    totalRefundAmount: { currency: 'USD', amount: 29.99 },
    returnOrderLines: [
      {
        returnOrderLineNumber: '1',
        salesOrderLineNumber: '1',
        item: {
          sku: 'WM-WIDGET-001',
          productName: 'Premium Widget',
        },
        charges: [
          {
            chargeType: 'PRODUCT',
            chargeAmount: { currency: 'USD', amount: 29.99 },
          },
        ],
        quantity: { unitOfMeasurement: 'EACH', amount: '1' },
        returnReason: 'DEFECTIVE',
      },
    ],
    ...overrides,
  }
}

describe('transformRefund (Walmart)', () => {
  it('uses returnOrderId as canonical id', () => {
    const result = transformRefund(makeReturn())
    expect(result.id).toBe('RET-2024050100001')
    expect(result.orderId).toBe('CO-987654321')
  })

  it('maps total refund amount', () => {
    const result = transformRefund(makeReturn())
    expect(result.amount).toEqual({ amount: 2999, currency: 'USD' })
  })

  it('maps return reason from first return order line', () => {
    const result = transformRefund(makeReturn())
    expect(result.reason).toBe('DEFECTIVE')
  })

  it('maps return order lines to refund line items', () => {
    const result = transformRefund(makeReturn())
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems![0]).toMatchObject({
      lineItemId: '1',
      quantity: 1,
      amount: { amount: 2999, currency: 'USD' },
    })
  })

  it('handles missing totalRefundAmount gracefully', () => {
    const result = transformRefund(makeReturn({ totalRefundAmount: undefined }))
    expect(result.amount).toBeUndefined()
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const result = transformRefund(makeReturn())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('preserves raw data in metadata', () => {
    const raw = makeReturn()
    const result = transformRefund(raw)
    expect(result.metadata['status']).toBe('COMPLETED')
    expect(result.metadata['returnOrderId']).toBe('RET-2024050100001')
  })
})

describe('untransformRefund (Walmart)', () => {
  it('produces Walmart refund request body with refund lines', () => {
    const body = untransformRefund({
      orderId: 'PO-001',
      refundLineItems: [
        {
          lineItemId: '1',
          quantity: 1,
          amount: { amount: 29.99, currency: 'USD' },
        },
      ],
    })
    const orderRefund = body['orderRefund'] as Record<string, unknown>
    const refundLines = orderRefund['refundLines'] as Record<string, unknown>
    const lineArr = refundLines['refundLine'] as unknown[]
    expect(lineArr).toHaveLength(1)
  })

  it('produces empty body when no refund line items', () => {
    const body = untransformRefund({ orderId: 'PO-001' })
    const orderRefund = body['orderRefund'] as Record<string, unknown>
    expect(orderRefund['refundLines']).toBeUndefined()
  })
})
