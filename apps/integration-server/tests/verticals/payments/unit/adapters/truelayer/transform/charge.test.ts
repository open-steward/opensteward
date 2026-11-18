import { describe, it, expect } from 'vitest'
import {
  transformPaymentCharge,
  transformTransactionCharge,
  type RawTrueLayerMerchantAccountPayment,
  type RawTrueLayerPayment,
} from '../../../../../../../src/verticals/payments/adapters/truelayer/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'
import { MERCHANT_ACCOUNT_PAYMENT, PAYMENT_FAILED, PAYMENT_SETTLED } from '../fixtures/documented'

describe('truelayer transformTransactionCharge', () => {
  it('maps a documented merchant_account_payment row, keyed by payment_id', () => {
    const raw = { ...MERCHANT_ACCOUNT_PAYMENT } as unknown as RawTrueLayerMerchantAccountPayment
    const result = ChargeSchema.parse(transformTransactionCharge(raw))
    expect(result.id).toBe('0afd1f6a-f611-48ce-9488-321129bb3a70')
    expect(result.externalId).toBe('0afd1f6a-f611-48ce-9488-321129bb3a70')
    expect(result.amount).toBe(1250)
    expect(result.currency).toBe('GBP')
    expect(result.status).toBe('succeeded')
    expect(result.metadata).toEqual({ prop1: 'value1' })
    expect(result.gateway).toBe('truelayer')
    expect(result.createdAt).toBeUndefined()
  })
})

describe('truelayer transformPaymentCharge', () => {
  it('maps a documented settled payment', () => {
    const raw = { ...PAYMENT_SETTLED } as unknown as RawTrueLayerPayment
    const result = ChargeSchema.parse(transformPaymentCharge(raw))
    expect(result.id).toBe('0afd1f6a-f611-48ce-9488-321129bb3a70')
    expect(result.amount).toBe(1250)
    expect(result.currency).toBe('GBP')
    expect(result.status).toBe('succeeded')
    expect(result.createdAt).toBe('2024-04-10T13:00:00.000Z')
    expect(result.failureCode).toBeUndefined()
  })

  it('maps a failed payment and its failure_reason', () => {
    const raw = { ...PAYMENT_FAILED } as unknown as RawTrueLayerPayment
    const result = ChargeSchema.parse(transformPaymentCharge(raw))
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('provider_rejected')
  })

  it.each([
    ['authorization_required', 'pending'],
    ['authorizing', 'pending'],
    ['authorized', 'pending'],
    ['attempt_failed', 'pending'],
    ['executed', 'succeeded'],
    ['settled', 'succeeded'],
    ['failed', 'failed'],
    ['something_new', 'unknown'],
  ])('maps status %s to %s', (status, expected) => {
    const raw = { ...PAYMENT_SETTLED, status } as unknown as RawTrueLayerPayment
    expect(ChargeSchema.parse(transformPaymentCharge(raw)).status).toBe(expected)
  })
})
