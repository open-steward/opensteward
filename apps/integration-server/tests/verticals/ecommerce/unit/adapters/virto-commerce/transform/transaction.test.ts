/**
 * Virto Commerce PaymentIn → canonical Transaction.
 *
 * Field shapes verified against the live demo instance's
 * VirtoCommerce.Orders/swagger.json `components.schemas.PaymentIn` /
 * `PaymentGatewayTransaction` (fetched 2026-09-13): orderId, gatewayCode,
 * paymentStatus (real enum — `New|Pending|Authorized|Paid|
 * PartiallyRefunded|Refunded|Voided|Custom|Cancelled|Declined|Error`),
 * total, currency, capturedDate/authorizedDate/incomingDate,
 * transactions[] (nested `PaymentGatewayTransaction`, carrying
 * processError/responseCode).
 */
import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawVirtoPaymentInDetail,
} from '../../../../../../../src/verticals/ecommerce/adapters/virto-commerce/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makePayment(overrides: Partial<RawVirtoPaymentInDetail> = {}): RawVirtoPaymentInDetail {
  return {
    id: 'pay-1',
    orderId: 'order-1',
    gatewayCode: 'AuthorizeNetPayment',
    paymentStatus: 'Paid',
    total: 64.9,
    currency: 'USD',
    capturedDate: '2026-01-15T09:31:00Z',
    incomingDate: '2026-01-15T09:30:00Z',
    ...overrides,
  }
}

describe('transformTransaction (virto-commerce)', () => {
  it('maps core fields', () => {
    const result = transformTransaction(makePayment())
    expect(result.id).toBe('pay-1')
    expect(result.orderId).toBe('order-1')
    expect(result.gateway).toBe('AuthorizeNetPayment')
  })

  it('maps the amount from total/currency', () => {
    expect(transformTransaction(makePayment()).amount).toEqual({ amount: 6490, currency: 'USD' })
  })

  it.each([
    ['New', 'PENDING'],
    ['Pending', 'PENDING'],
    ['Authorized', 'SUCCESS'],
    ['Paid', 'SUCCESS'],
    ['Declined', 'FAILURE'],
    ['Error', 'ERROR'],
    ['Custom', 'unknown'],
  ] as const)('maps paymentStatus %s to canonical status %s', (paymentStatus, status) => {
    expect(transformTransaction(makePayment({ paymentStatus })).status).toBe(status)
  })

  it('maps Authorized to kind AUTHORIZATION and Paid to CAPTURE', () => {
    expect(transformTransaction(makePayment({ paymentStatus: 'Authorized' })).kind).toBe('AUTHORIZATION')
    expect(transformTransaction(makePayment({ paymentStatus: 'Paid' })).kind).toBe('CAPTURE')
    expect(transformTransaction(makePayment({ paymentStatus: 'Refunded' })).kind).toBe('REFUND')
    expect(transformTransaction(makePayment({ paymentStatus: 'Voided' })).kind).toBe('VOID')
  })

  it('maps processedAt preferring capturedDate, then authorizedDate, then incomingDate', () => {
    expect(transformTransaction(makePayment()).processedAt).toBe('2026-01-15T09:31:00Z')
    expect(
      transformTransaction(makePayment({ capturedDate: undefined, authorizedDate: '2026-01-15T09:29:00Z' }))
        .processedAt,
    ).toBe('2026-01-15T09:29:00Z')
  })

  it('pulls errorCode/errorMessage from the last nested gateway transaction', () => {
    const result = transformTransaction(
      makePayment({
        paymentStatus: 'Declined',
        transactions: [{ responseCode: '05', processError: 'Do not honor' }],
      }),
    )
    expect(result.errorCode).toBe('05')
    expect(result.errorMessage).toBe('Do not honor')
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makePayment()
    expect(transformTransaction(raw).metadata).toEqual(raw)
  })

  it('satisfies TransactionSchema', () => {
    expect(() => TransactionSchema.parse(transformTransaction(makePayment()))).not.toThrow()
  })

  it('omits amount rather than guess a currency when currency is not reported', () => {
    const result = transformTransaction(makePayment({ currency: undefined }))
    expect(result.amount).toBeUndefined()
  })
})
