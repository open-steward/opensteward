import { describe, it, expect } from 'vitest'
import { transformPayment, transformPaymentAdjustment } from '../../../../../../../src/verticals/ecommerce/adapters/etsy/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

/**
 * The question was whether `Payment.status` has documented values beyond
 * "settled"/"authed", and whether adjustment state should come from the
 * boolean `is_success` or the string `status`.
 *
 * Both were resolved against Etsy's own OpenAPI document
 * (https://www.etsy.com/openapi/generated/oas/3.0.0.json, "Etsy Open API v3
 * 3.0.0", fetched 2026-09-15), not from a live call:
 *
 *   Payment.status            type: string, NO enum. "A string indicating the
 *                             current status of the payment, most commonly
 *                             \"settled\" or \"authed\"."
 *   PaymentAdjustment.status  type: string, NO enum. "The status string of the
 *                             payment adjustment."
 *   PaymentAdjustment.is_success  boolean. "When true, the payment adjustment
 *                             was or is likely to complete successfully."
 *
 * The one settlement-like enum in the whole spec belongs to `ShopReceipt`.
 *
 * So the existing mapping was already right, and these pin it against being
 * "improved" later by someone guessing at an enum Etsy does not publish.
 */

const money = { amount: 1999, divisor: 100, currency_code: 'USD' }

function payment(status: string | undefined) {
  return {
    payment_id: 1,
    receipt_id: 9,
    amount_gross: money,
    status,
    created_timestamp: 1770000000,
  } as never
}

function adjustment(is_success: boolean | undefined, status?: string) {
  return {
    payment_adjustment_id: 2,
    payment_id: 1,
    total_adjustment_amount: money,
    is_success,
    status,
    created_timestamp: 1770000000,
  } as never
}

describe('etsy payment status', () => {
  it('maps the two values Etsy names', () => {
    expect(transformPayment(payment('settled')).status).toBe('SUCCESS')
    expect(transformPayment(payment('authed')).status).toBe('PENDING')
  })

  it('reports an undocumented value as unknown rather than guessing', () => {
    // Etsy says "most commonly", i.e. the set is open. Inventing a mapping for
    // a value it does not publish would fabricate precision.
    expect(transformPayment(payment('some_future_state')).status).toBe('unknown')
    expect(transformPayment(payment(undefined)).status).toBe('unknown')
  })

  it('produces schema-valid output', () => {
    expect(() => TransactionSchema.parse(transformPayment(payment('settled')))).not.toThrow()
  })
})

describe('etsy adjustment status', () => {
  it('reads is_success, the only one of the two fields with documented semantics', () => {
    expect(transformPaymentAdjustment(payment('settled'), adjustment(true)).status).toBe('SUCCESS')
    expect(transformPaymentAdjustment(payment('settled'), adjustment(false)).status).toBe('FAILURE')
  })

  it('ignores the undocumented status string even when it contradicts is_success', () => {
    // The guard on the choice: `status` is an unenumerated free string, so a
    // plausible-looking value must not override the documented boolean.
    expect(transformPaymentAdjustment(payment('settled'), adjustment(true, 'failed')).status).toBe('SUCCESS')
    expect(transformPaymentAdjustment(payment('settled'), adjustment(false, 'success')).status).toBe('FAILURE')
  })

  it('reports a missing is_success as unknown', () => {
    expect(transformPaymentAdjustment(payment('settled'), adjustment(undefined)).status).toBe('unknown')
  })
})
