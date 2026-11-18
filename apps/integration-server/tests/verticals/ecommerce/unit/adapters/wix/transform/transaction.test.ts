/**
 * Wix order payment → canonical Transaction.
 *
 * Fixture fields follow the `Payment` schema of List Transactions For Single
 * Order (e-commerce/orders/order-transactions/list-transactions-for-single-order.md);
 * the values are those of its documented example (payment
 * 80bcb25b-…, amount "25.00").
 */
import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawWixPayment,
} from '../../../../../../../src/verticals/ecommerce/adapters/wix/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

const ORDER = '24ca690c-8162-44ae-abda-46415767340d'

function makePayment(overrides: Partial<RawWixPayment> = {}): RawWixPayment {
  return {
    id: '80bcb25b-0a91-4155-b0f3-c132b0e937a6',
    regularPaymentDetails: {
      gatewayTransactionId: 'b7f3a1c9-2e84-4d17-9c5a-8e2f6b4d1a30',
      offlinePayment: false,
      savedPaymentMethod: false,
    },
    createdDate: '2026-07-26T13:11:45.312Z',
    updatedDate: '2026-07-26T13:12:12.862Z',
    amount: { amount: '25.00', formattedAmount: '$25.00' },
    refundDisabled: false,
    status: 'APPROVED',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('parses with TransactionSchema, with an orderId:paymentId id', () => {
    const t = TransactionSchema.parse(transformTransaction(makePayment(), ORDER, 'USD'))
    expect(t.id).toBe(`${ORDER}:80bcb25b-0a91-4155-b0f3-c132b0e937a6`)
    expect(t.orderId).toBe(ORDER)
    expect(t.status).toBe('SUCCESS')
    expect(t.amount).toEqual({ amount: 2500, currency: 'USD' })
    expect(t.createdAt).toBe('2026-07-26T13:11:45.312Z')
  })

  it('leaves the amount out when the order currency is unknown', () => {
    const t = TransactionSchema.parse(transformTransaction(makePayment(), ORDER, undefined))
    expect(t.amount).toBeUndefined()
  })

  it('maps payment statuses, unknown for ones with no canonical counterpart', () => {
    const st = (s: string) => transformTransaction(makePayment({ status: s }), ORDER, 'USD').status
    expect(st('PENDING')).toBe('PENDING')
    expect(st('PENDING_MERCHANT')).toBe('PENDING')
    expect(st('DECLINED')).toBe('FAILURE')
    expect(st('REFUNDED')).toBe('unknown')
  })

  it('does not invent a kind or a gateway', () => {
    const t = transformTransaction(makePayment(), ORDER, 'USD')
    expect(t.kind).toBeUndefined()
    expect(t.gateway).toBeUndefined()
  })

  it('refuses a payment without an id', () => {
    expect(() => transformTransaction(makePayment({ id: undefined }), ORDER, 'USD')).toThrow(/id/)
  })
})
