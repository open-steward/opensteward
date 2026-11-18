import { describe, it, expect } from 'vitest'
import {
  transformPayment,
  transformPaymentAdjustment,
  transformTransactions,
  type RawEtsyPayment,
  type RawEtsyPaymentAdjustment,
} from '../../../../../../../src/verticals/ecommerce/adapters/etsy/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makePayment(overrides: Partial<RawEtsyPayment> = {}): RawEtsyPayment {
  return {
    payment_id: 555111,
    receipt_id: 2345678901,
    amount_gross: { amount: 3498, divisor: 100, currency_code: 'USD' },
    amount_fees: { amount: 105, divisor: 100, currency_code: 'USD' },
    amount_net: { amount: 3393, divisor: 100, currency_code: 'USD' },
    currency: 'USD',
    status: 'settled',
    created_timestamp: 1714564800, // 2024-05-01T12:00:00Z
    updated_timestamp: 1714568400,
    ...overrides,
  }
}

function makeAdjustment(
  overrides: Partial<RawEtsyPaymentAdjustment> = {},
): RawEtsyPaymentAdjustment {
  return {
    payment_adjustment_id: 777222,
    payment_id: 555111,
    status: 'adjusted',
    is_success: true,
    reason_code: 'buyer_refund',
    total_adjustment_amount: { amount: 1000, divisor: 100, currency_code: 'USD' },
    created_timestamp: 1714651200, // 2024-05-02T12:00:00Z
    ...overrides,
  }
}

describe('transformPayment (Etsy)', () => {
  it('maps a Payment to a SALE transaction using payment_id as the canonical id', () => {
    const result = transformPayment(makePayment())
    expect(result.id).toBe('555111')
    expect(result.orderId).toBe('2345678901')
    expect(result.kind).toBe('SALE')
    expect(result.amount).toEqual({ amount: 3498, currency: 'USD' })
  })

  it('maps status: settled -> SUCCESS, authed -> PENDING, anything else -> unknown', () => {
    expect(transformPayment(makePayment({ status: 'settled' })).status).toBe('SUCCESS')
    expect(transformPayment(makePayment({ status: 'authed' })).status).toBe('PENDING')
    expect(transformPayment(makePayment({ status: 'chargeback' })).status).toBe('unknown')
    expect(transformPayment(makePayment({ status: undefined })).status).toBe('unknown')
  })

  it('converts created_timestamp (epoch seconds) to ISO for processedAt/createdAt', () => {
    const result = transformPayment(makePayment())
    expect(result.processedAt).toBe('2024-05-01T12:00:00.000Z')
    expect(result.createdAt).toBe('2024-05-01T12:00:00.000Z')
  })

  it('produces a payload that satisfies TransactionSchema and preserves raw in metadata by reference', () => {
    const raw = makePayment()
    const result = transformPayment(raw)
    expect(() => TransactionSchema.parse(result)).not.toThrow()
    expect(result.metadata).toBe(raw)
  })
})

describe('transformPaymentAdjustment (Etsy)', () => {
  it('maps a PaymentAdjustment to a REFUND transaction: id = payment_adjustment_id, parentTransactionId = payment_id', () => {
    const payment = makePayment()
    const adjustment = makeAdjustment()
    const result = transformPaymentAdjustment(payment, adjustment)
    expect(result.id).toBe('777222')
    expect(result.kind).toBe('REFUND')
    expect(result.parentTransactionId).toBe('555111')
    expect(result.orderId).toBe('2345678901')
    expect(result.amount).toEqual({ amount: 1000, currency: 'USD' })
  })

  it('maps is_success to SUCCESS/FAILURE/unknown, not the ambiguous status string', () => {
    expect(
      transformPaymentAdjustment(makePayment(), makeAdjustment({ is_success: true })).status,
    ).toBe('SUCCESS')
    expect(
      transformPaymentAdjustment(makePayment(), makeAdjustment({ is_success: false })).status,
    ).toBe('FAILURE')
    expect(
      transformPaymentAdjustment(makePayment(), makeAdjustment({ is_success: undefined })).status,
    ).toBe('unknown')
  })

  it('falls back to the parent Payment payment_id when the adjustment omits its own payment_id', () => {
    const payment = makePayment({ payment_id: 999 })
    const adjustment = makeAdjustment({ payment_id: undefined })
    expect(transformPaymentAdjustment(payment, adjustment).parentTransactionId).toBe('999')
  })

  it('produces a payload that satisfies TransactionSchema and preserves raw in metadata by reference', () => {
    const payment = makePayment()
    const raw = makeAdjustment()
    const result = transformPaymentAdjustment(payment, raw)
    expect(() => TransactionSchema.parse(result)).not.toThrow()
    expect(result.metadata).toBe(raw)
  })
})

describe('transformTransactions (Etsy)', () => {
  it('flattens one Payment with no adjustments to a single SALE transaction', () => {
    const out = transformTransactions(makePayment({ payment_adjustments: undefined }))
    expect(out).toHaveLength(1)
    expect(out[0]!.kind).toBe('SALE')
  })

  it('flattens one Payment with adjustments to [SALE, REFUND, REFUND, ...]', () => {
    const out = transformTransactions(
      makePayment({
        payment_adjustments: [
          makeAdjustment({ payment_adjustment_id: 1 }),
          makeAdjustment({ payment_adjustment_id: 2 }),
        ],
      }),
    )
    expect(out).toHaveLength(3)
    expect(out[0]!.kind).toBe('SALE')
    expect(out[0]!.id).toBe('555111')
    expect(out[1]!.kind).toBe('REFUND')
    expect(out[1]!.id).toBe('1')
    expect(out[1]!.parentTransactionId).toBe('555111')
    expect(out[2]!.kind).toBe('REFUND')
    expect(out[2]!.id).toBe('2')
    for (const t of out) {
      expect(() => TransactionSchema.parse(t)).not.toThrow()
    }
  })
})
