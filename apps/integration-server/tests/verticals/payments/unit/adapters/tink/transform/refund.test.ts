import { describe, it, expect } from 'vitest'
import { transformRefund } from '../../../../../../../src/verticals/payments/adapters/tink/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'
import { REFUND } from '../fixtures'

describe('tink transformRefund (documented SettlementAccountRefund)', () => {
  it('maps the documented example refund', () => {
    const r = RefundSchema.parse(transformRefund(REFUND))
    expect(r.id).toBe('b58d313a-b778-4639-8e31-c9ffc35e2d01')
    expect(r.externalId).toBe(r.id)
    // transactionId: "Id of the transaction to refund." — the charge id space
    expect(r.chargeId).toBe('7ad0feab-bd55-449d-aa7e-b3d3b9c62550')
    expect(r.amount).toBe(5000)
    expect(r.currency).toBe('EUR')
    expect(r.status).toBe('succeeded')
    expect(r.metadata).toEqual({ key1: 'value1', key2: 'value2' })
    expect(r.createdAt).toBe('2022-07-14T14:01:53.000Z')
    expect(r.updatedAt).toBe('2022-07-14T14:08:53.000Z')
    expect(r.gateway).toBe('tink')
    expect(r.reason).toBeUndefined()
  })

  it.each([
    ['PENDING', 'pending'],
    ['COMPLETED', 'succeeded'],
    ['FAILED', 'failed'],
    ['SOMETHING_NEW', 'unknown'],
  ])('maps SettlementAccountRefundStatus %s to %s', (status, want) => {
    expect(RefundSchema.parse(transformRefund({ ...REFUND, status })).status).toBe(want)
  })

  it('throws rather than inventing a charge link', () => {
    expect(() => transformRefund({ ...REFUND, transactionId: '' })).toThrow(/transactionId/)
  })

  it('throws rather than defaulting a currency', () => {
    expect(() =>
      transformRefund({ ...REFUND, amount: { value: REFUND.amount.value } } as never),
    ).toThrow(/currencyCode/)
  })
})
