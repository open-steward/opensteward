import { describe, it, expect } from 'vitest'
import { transformCharge } from '../../../../../../../src/verticals/payments/adapters/sumup/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'
import { HISTORY_ROW, TRANSACTION_FULL } from '../fixtures'

describe('sumup transformCharge', () => {
  it('maps a documented history row, amounts from major to minor units', () => {
    const c = ChargeSchema.parse(transformCharge(HISTORY_ROW, 'transaction_id'))
    expect(c.id).toBe('410fc44a-5956-44e1-b5cc-19c6f8d727a4')
    expect(c.externalId).toBe(c.id)
    expect(c.amount).toBe(1010)
    expect(c.amountRefunded).toBe(0)
    expect(c.currency).toBe('EUR')
    expect(c.status).toBe('succeeded')
    expect(c.createdAt).toBe('2020-02-29T10:56:56.876Z')
    expect(c.metadata).toEqual({ transactionCode: 'TEENSK4W2K', paymentType: 'ECOM' })
    expect(c.gateway).toBe('sumup')
  })

  it('maps a retrieved transaction by its id, to the same charge id as the history row', () => {
    const c = ChargeSchema.parse(transformCharge(TRANSACTION_FULL, 'id'))
    expect(c.id).toBe(transformCharge(HISTORY_ROW, 'transaction_id').id)
    expect(c.amount).toBe(1010)
  })

  it('maps product_summary to description (spec example "Purchase")', () => {
    const c = ChargeSchema.parse(transformCharge({ ...HISTORY_ROW, product_summary: 'Purchase' }))
    expect(c.description).toBe('Purchase')
    expect(transformCharge(HISTORY_ROW).description).toBeUndefined()
  })

  it.each([
    ['CANCELLED', 'cancelled'],
    ['FAILED', 'failed'],
    ['PENDING', 'pending'],
    ['SOMETHING_ELSE', 'unknown'],
  ])('maps status %s to %s', (status, expected) => {
    expect(ChargeSchema.parse(transformCharge({ ...HISTORY_ROW, status })).status).toBe(expected)
  })

  it('tells a full refund from a partial one by refunded_amount', () => {
    const full = transformCharge({ ...HISTORY_ROW, status: 'REFUNDED', refunded_amount: 10.1 })
    const part = transformCharge({ ...HISTORY_ROW, status: 'REFUNDED', refunded_amount: 4 })
    const unsaid = transformCharge({ ...TRANSACTION_FULL, status: 'REFUNDED' }, 'id')
    expect(ChargeSchema.parse(full).status).toBe('refunded')
    expect(ChargeSchema.parse(part).status).toBe('partially_refunded')
    expect(part.amountRefunded).toBe(400)
    expect(ChargeSchema.parse(unsaid).status).toBe('unknown')
  })

  it('throws rather than inventing a missing id, currency or amount', () => {
    expect(() => transformCharge({ ...HISTORY_ROW, transaction_id: undefined })).toThrow(
      /transaction_id/,
    )
    expect(() => transformCharge({ ...HISTORY_ROW, currency: undefined })).toThrow(/currency/)
    expect(() => transformCharge({ ...HISTORY_ROW, amount: undefined })).toThrow(/amount/)
  })
})
