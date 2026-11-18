/**
 * Fixture: the refund transaction from Paydock's documented "charges/refund"
 * example response "refund success"
 * (https://documenter.getpostman.com/view/6912944/Uyr5my5q).
 */
import { describe, it, expect } from 'vitest'
import { transformRefundTransaction } from '../../../../../../../src/verticals/payments/adapters/paydock/transform/refund-transaction'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'
import { DOC_REFUND_CHARGE } from '../fixtures/docs'

const TX = DOC_REFUND_CHARGE.transactions[1]!

describe('paydock transformRefundTransaction', () => {
  it('maps the documented refund transaction', () => {
    const r = RefundSchema.parse(transformRefundTransaction(TX, DOC_REFUND_CHARGE._id))
    expect(r.id).toBe('5ecd10c951eff9228f882b95')
    expect(r.chargeId).toBe('5ecd108a51eff9228f882b8b')
    expect(r.amount).toBe(1000)
    expect(r.currency).toBe('AUD')
    expect(r.status).toBe('pending')
    expect(r.createdAt).toBe('2020-05-26T12:51:21.331Z')
  })

  it('maps the documented transaction statuses', () => {
    const st = (status: string) => transformRefundTransaction({ ...TX, status }, 'c').status
    expect(st('complete')).toBe('succeeded')
    expect(st('failed')).toBe('failed')
    expect(st('requested')).toBe('pending')
    expect(st('inprogress')).toBe('pending')
    expect(st('cancelled')).toBe('cancelled')
    expect(st('something_else')).toBe('unknown')
  })

  it('throws when _id, amount or currency is missing', () => {
    expect(() => transformRefundTransaction({ ...TX, _id: undefined }, 'c')).toThrow(/_id/)
    expect(() => transformRefundTransaction({ ...TX, amount: undefined }, 'c')).toThrow(/amount/)
    expect(() => transformRefundTransaction({ ...TX, currency: undefined }, 'c')).toThrow(/amount/)
  })

  it('upper-cases a lower-case documented currency code', () => {
    expect(transformRefundTransaction({ ...TX, currency: 'aud' }, 'c').currency).toBe('AUD')
  })
})
