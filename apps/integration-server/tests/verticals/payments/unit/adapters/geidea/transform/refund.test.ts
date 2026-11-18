import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  extractRefundTransaction,
} from '../../../../../../../src/verticals/payments/adapters/geidea/transform/refund'
import type {
  RawGeideaOrder,
  RawGeideaTransaction,
} from '../../../../../../../src/verticals/payments/adapters/geidea/transform/charge'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('geidea transformRefund', () => {
  it('maps a succeeded refund transaction to status "succeeded"', () => {
    const order: RawGeideaOrder = {
      orderId: 'ord-001',
      amount: 100.0,
      currency: 'EGP',
      detailedStatus: 'Refunded',
      createdDate: '2024-03-01T00:00:00Z',
      updatedDate: '2024-03-01T00:00:00Z',
      transactions: [
        {
          transactionId: 'txn-refund-001',
          type: 'refund',
          status: 'Success',
          amount: 100.0,
          currency: 'EGP',
        },
      ],
    }
    const tx: RawGeideaTransaction = order.transactions![0]
    const result = transformRefund(order, tx)
    expect(result.status).toBe('succeeded')
    expect(result.id).toBe('txn-refund-001')
    expect(result.chargeId).toBe('ord-001')
    expect(result.amount).toBe(10000)
    expect(result.currency).toBe('EGP')
    expect(result.gateway).toBe('geidea')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a failed refund transaction to status "failed" with failureReason', () => {
    const order: RawGeideaOrder = {
      orderId: 'ord-002',
      amount: 50.0,
      currency: 'SAR',
      detailedStatus: 'Failed',
    }
    const tx: RawGeideaTransaction = {
      transactionId: 'txn-refund-002',
      type: 'refund',
      status: 'Failed',
      amount: 50.0,
      currency: 'SAR',
      responseMessage: 'Insufficient funds',
    }
    const result = transformRefund(order, tx)
    expect(result.status).toBe('failed')
    expect(result.failureReason).toBe('Insufficient funds')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps an order without a refund tx, using order amount as fallback', () => {
    const order: RawGeideaOrder = {
      orderId: 'ord-003',
      amount: 25.0,
      currency: 'AED',
      detailedStatus: 'Refunded',
    }
    const result = transformRefund(order)
    expect(result.id).toBe('ord-003')
    expect(result.chargeId).toBe('ord-003')
    expect(result.amount).toBe(2500)
    expect(result.status).toBe('succeeded')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('maps a Cancelled refund to status "cancelled"', () => {
    const order: RawGeideaOrder = {
      orderId: 'ord-004',
      amount: 10.0,
      currency: 'EGP',
    }
    const tx: RawGeideaTransaction = {
      transactionId: 'txn-refund-004',
      type: 'refund',
      status: 'Cancelled',
      amount: 10.0,
    }
    const result = transformRefund(order, tx)
    expect(result.status).toBe('cancelled')
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})

describe('geidea extractRefundTransaction', () => {
  it('returns the last refund-type transaction', () => {
    const order: RawGeideaOrder = {
      orderId: 'ord-x',
      transactions: [
        { transactionId: 'txn-pay-1', type: 'pay', status: 'Success' },
        { transactionId: 'txn-refund-1', type: 'refund', status: 'Success' },
        { transactionId: 'txn-refund-2', type: 'refund', status: 'Success' },
      ],
    }
    const tx = extractRefundTransaction(order)
    expect(tx?.transactionId).toBe('txn-refund-2')
  })

  it('returns undefined when no refund transactions exist', () => {
    const order: RawGeideaOrder = {
      orderId: 'ord-y',
      transactions: [{ transactionId: 'txn-pay-1', type: 'pay', status: 'Success' }],
    }
    expect(extractRefundTransaction(order)).toBeUndefined()
  })
})
