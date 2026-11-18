import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawAtomePayment,
} from '../../../../../../../src/verticals/payments/adapters/atome/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('atome transformCharge', () => {
  it('maps a PAID payment to status "succeeded"', () => {
    const raw: RawAtomePayment = {
      referenceId: 'atome-ref-001',
      merchantReferenceId: 'merch-001',
      currency: 'SGD',
      amount: 5000,
      refundableAmount: 5000,
      status: 'PAID',
      paymentTransaction: {
        orderId: 'order-001',
        transactionId: 'txn-001',
        createAt: '1709251200000',
        tenor: 3,
      },
      refundTransactions: [],
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('SGD')
    expect(result.id).toBe('atome-ref-001')
    expect(result.gateway).toBe('atome')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a PROCESSING payment to status "pending"', () => {
    const raw: RawAtomePayment = {
      referenceId: 'atome-ref-002',
      currency: 'SGD',
      amount: 2000,
      status: 'PROCESSING',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(2000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a FAILED payment to status "failed"', () => {
    const raw: RawAtomePayment = {
      referenceId: 'atome-ref-003',
      currency: 'MYR',
      amount: 1000,
      status: 'FAILED',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.currency).toBe('MYR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a REFUNDED payment to status "refunded"', () => {
    const raw: RawAtomePayment = {
      referenceId: 'atome-ref-004',
      currency: 'SGD',
      amount: 3000,
      refundableAmount: 0,
      status: 'REFUNDED',
      refundTransactions: [
        {
          refundId: 'refund-001',
          transactionId: 'rtxn-001',
          amount: 3000,
          createAt: '1709337600000',
        },
      ],
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(result.amountRefunded).toBe(3000)
    expect(result.refundIds).toContain('refund-001')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a PAID payment with partial refund to "partially_refunded"', () => {
    const raw: RawAtomePayment = {
      referenceId: 'atome-ref-005',
      currency: 'SGD',
      amount: 5000,
      refundableAmount: 2500,
      status: 'PAID',
      refundTransactions: [
        {
          refundId: 'refund-002',
          amount: 2500,
          createAt: '1709337600000',
        },
      ],
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('partially_refunded')
    expect(result.amountRefunded).toBe(2500)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELLED payment to status "cancelled"', () => {
    const raw: RawAtomePayment = {
      referenceId: 'atome-ref-006',
      currency: 'SGD',
      amount: 1500,
      status: 'CANCELLED',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
