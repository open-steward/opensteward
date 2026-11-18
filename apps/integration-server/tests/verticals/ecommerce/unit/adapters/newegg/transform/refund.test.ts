import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawNeweggRMA,
} from '../../../../../../../src/verticals/ecommerce/adapters/newegg/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRMA(overrides: Partial<RawNeweggRMA> = {}): RawNeweggRMA {
  return {
    RMANumber: 'RMA-2024050100001',
    OrderNumber: 'NE-2024050100001',
    RMADate: '05/03/2024 10:00:00',
    RMADateInGMT: '2024-05-03T15:00:00.000Z',
    RMAStatus: 3,
    RMAStatusDescription: 'Received',
    RMAType: 1,
    RMATypeDescription: 'Refund',
    RefundTotalAmount: 1599.99,
    RMAItemList: [
      {
        SellerPartNumber: 'GPU-RTX4090-24G',
        NeweggItemNumber: '9SIAABC12345',
        Description: 'NVIDIA GeForce RTX 4090',
        Quantity: 1,
        UnitPrice: 1599.99,
        RefundAmount: 1599.99,
        RMAReason: 'Defective',
        RMAReasonDescription: 'Product arrived damaged',
      },
    ],
    ...overrides,
  }
}

describe('transformRefund (Newegg)', () => {
  it('uses RMANumber as canonical id', () => {
    const result = transformRefund(makeRMA())
    expect(result.id).toBe('RMA-2024050100001')
    expect(result.orderId).toBe('NE-2024050100001')
  })

  it('maps total refund amount', () => {
    const result = transformRefund(makeRMA())
    expect(result.amount).toEqual({ amount: 159999, currency: 'USD' })
  })

  it('maps RMATypeDescription as reason', () => {
    const result = transformRefund(makeRMA())
    expect(result.reason).toBe('Refund')
  })

  it('falls back to RMAStatusDescription when RMATypeDescription is missing', () => {
    const result = transformRefund(makeRMA({ RMATypeDescription: undefined }))
    expect(result.reason).toBe('Received')
  })

  it('maps RMA item list to refund line items', () => {
    const result = transformRefund(makeRMA())
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems![0]).toMatchObject({
      lineItemId: 'GPU-RTX4090-24G',
      quantity: 1,
      amount: { amount: 159999, currency: 'USD' },
    })
  })

  it('handles missing RefundTotalAmount gracefully', () => {
    const result = transformRefund(makeRMA({ RefundTotalAmount: undefined }))
    expect(result.amount).toBeUndefined()
  })

  it('handles missing RMAItemList gracefully', () => {
    const result = transformRefund(makeRMA({ RMAItemList: undefined }))
    expect(result.refundLineItems).toBeUndefined()
  })

  it('falls back to SourceSONumber for orderId when OrderNumber missing', () => {
    const result = transformRefund(
      makeRMA({ OrderNumber: undefined, SourceSONumber: 'SO-12345' }),
    )
    expect(result.orderId).toBe('SO-12345')
  })

  it('uses RMANumber as last fallback for orderId', () => {
    const result = transformRefund(
      makeRMA({ OrderNumber: undefined, SourceSONumber: undefined }),
    )
    expect(result.orderId).toBe('RMA-2024050100001')
  })

  it('produces a payload that satisfies RefundSchema', () => {
    const result = transformRefund(makeRMA())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('preserves raw data in metadata', () => {
    const raw = makeRMA()
    const result = transformRefund(raw)
    expect(result.metadata['RMAStatus']).toBe(3)
    expect(result.metadata['RMANumber']).toBe('RMA-2024050100001')
  })

  it('uses GMT date for processedAt and createdAt', () => {
    const result = transformRefund(makeRMA())
    expect(result.processedAt).toBe('2024-05-03T15:00:00.000Z')
    expect(result.createdAt).toBe('2024-05-03T15:00:00.000Z')
  })

  it('falls back to RMADate when RMADateInGMT is missing', () => {
    const result = transformRefund(makeRMA({ RMADateInGMT: undefined }))
    expect(result.processedAt).toBe('05/03/2024 10:00:00')
  })
})

describe('untransformRefund (Newegg)', () => {
  it('produces Newegg RMA request body with item list', () => {
    const body = untransformRefund({
      orderId: 'NE-001',
      reason: 'Defective product',
      refundLineItems: [
        {
          lineItemId: 'GPU-RTX4090-24G',
          quantity: 1,
          amount: { amount: 159999, currency: 'USD' },
        },
      ],
    })
    expect(body['OrderNumber']).toBe('NE-001')
    expect(body['RMATypeDescription']).toBe('Defective product')
    const itemList = body['RMAItemList'] as unknown[]
    expect(itemList).toHaveLength(1)
  })

  it('produces body without RMAItemList when no refund line items', () => {
    const body = untransformRefund({ orderId: 'NE-001' })
    expect(body['OrderNumber']).toBe('NE-001')
    expect(body['RMAItemList']).toBeUndefined()
  })

  it('maps refund amount into item list entry', () => {
    const body = untransformRefund({
      orderId: 'NE-001',
      refundLineItems: [
        {
          lineItemId: 'PART-001',
          quantity: 2,
          amount: { amount: 4999, currency: 'USD' },
        },
      ],
    })
    const items = body['RMAItemList'] as Array<Record<string, unknown>>
    expect(items[0]!['SellerPartNumber']).toBe('PART-001')
    expect(items[0]!['Quantity']).toBe(2)
    expect(items[0]!['RefundAmount']).toBe(49.99)
  })
})
