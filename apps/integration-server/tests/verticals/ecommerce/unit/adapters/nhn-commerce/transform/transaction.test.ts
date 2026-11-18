import { describe, it, expect } from 'vitest'
import { transformOrderTransaction } from '../../../../../../../src/verticals/ecommerce/adapters/nhn-commerce/transform/transaction'
import type { RawNhnOrder } from '../../../../../../../src/verticals/ecommerce/adapters/nhn-commerce/transform/order'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeRaw(overrides: Partial<RawNhnOrder> = {}): RawNhnOrder {
  return {
    orderNo: 'ORD20240301001',
    orderYmdt: '2024-03-01T00:00:00Z',
    payType: 'CREDIT_CARD',
    lastOrderAmt: {
      payAmt: 55000,
      totalProductAmt: 50000,
      deliveryAmt: 3000,
    },
    orderOptions: [
      {
        orderNo: 'ORD20240301001',
        orderOptionNo: 10001,
        productNo: 555,
        orderStatusType: 'PAY_DONE',
      },
    ],
    member: true,
    ...overrides,
  }
}

describe('transformOrderTransaction (NHN Commerce)', () => {
  it('maps orderNo to both id and orderId', () => {
    const result = transformOrderTransaction(makeRaw())
    expect(result.id).toBe('ORD20240301001')
    expect(result.orderId).toBe('ORD20240301001')
  })

  it('maps CREDIT_CARD payType to SALE kind', () => {
    const result = transformOrderTransaction(makeRaw())
    expect(result.kind).toBe('SALE')
  })

  it('maps BANK_TRANSFER payType to SALE kind', () => {
    const result = transformOrderTransaction(makeRaw({ payType: 'BANK_TRANSFER' }))
    expect(result.kind).toBe('SALE')
  })

  it('maps PAY_DONE orderStatus to SUCCESS', () => {
    const result = transformOrderTransaction(makeRaw())
    expect(result.status).toBe('SUCCESS')
  })

  it('maps DEPOSIT_WAIT orderStatus to PENDING', () => {
    const result = transformOrderTransaction(
      makeRaw({
        orderOptions: [{ ...makeRaw().orderOptions![0]!, orderStatusType: 'DEPOSIT_WAIT' }],
      }),
    )
    expect(result.status).toBe('PENDING')
  })

  it('maps payAmt to amount in KRW (stays 1:1)', () => {
    const result = transformOrderTransaction(makeRaw())
    expect(result.amount).toEqual({ amount: 55000, currency: 'KRW' })
  })

  it('maps payType to gateway', () => {
    const result = transformOrderTransaction(makeRaw())
    expect(result.gateway).toBe('CREDIT_CARD')
  })

  it('maps orderYmdt to processedAt and createdAt as ISO strings', () => {
    const result = transformOrderTransaction(makeRaw())
    expect(result.processedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    const result = transformOrderTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
