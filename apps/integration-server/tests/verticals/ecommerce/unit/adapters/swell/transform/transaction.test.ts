/**
 * Swell payment transform, against "The payment model" example
 * (https://developers.swell.is/backend-api/payments).
 */
import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawSwellPayment,
} from '../../../../../../../src/verticals/ecommerce/adapters/swell/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

const DOC_PAYMENT: RawSwellPayment = {
  id: '60f199509111e70000000056',
  account_id: '60f199509111e7000000005a',
  amount: 50,
  method: 'card',
  account_card_id: '60f199509111e70000000058',
  amount_refundable: 30,
  amount_refunded: 20,
  async: false,
  authorized: true,
  captured: true,
  currency: 'USD',
  date_created: '2021-07-16T14:36:00.313Z',
  date_updated: '2021-07-16T14:36:00.313Z',
  error: null,
  gateway: 'stripe',
  number: 2973512,
  order_id: '60f199509111e70000000059',
  status: 'success',
  success: true,
  test: true,
  transaction_id: 'ch_1XNoXdEAeofUkt5SrbA6Swow',
}

describe('swell transformTransaction', () => {
  it('maps the documented payment example and parses as a Transaction', () => {
    const t = TransactionSchema.parse(transformTransaction(DOC_PAYMENT))
    expect(t.id).toBe('60f199509111e70000000056')
    expect(t.orderId).toBe('60f199509111e70000000059')
    expect(t.amount).toEqual({ amount: 5000, currency: 'USD' })
    expect(t.gateway).toBe('stripe')
    expect(t.kind).toBe('CAPTURE')
    expect(t.status).toBe('SUCCESS')
    expect(t.createdAt).toBe('2021-07-16T14:36:00.313Z')
  })

  it('maps kinds and statuses from the documented enum', () => {
    const map = (p: Partial<RawSwellPayment>) => {
      const t = TransactionSchema.parse(transformTransaction({ ...DOC_PAYMENT, ...p }))
      return [t.kind, t.status]
    }
    expect(map({ authorized: false })).toEqual(['SALE', 'SUCCESS'])
    expect(map({ status: 'authorized', captured: false })).toEqual(['AUTHORIZATION', 'SUCCESS'])
    expect(map({ status: 'void' })).toEqual(['VOID', 'SUCCESS'])
    expect(map({ status: 'pending', captured: false })).toEqual([undefined, 'PENDING'])
    expect(map({ status: 'error', captured: false })).toEqual([undefined, 'ERROR'])
    expect(map({ status: 'something-new' })).toEqual(['CAPTURE', 'unknown'])
  })

  it('maps error details and omits money without a currency', () => {
    const t = TransactionSchema.parse(
      transformTransaction({
        ...DOC_PAYMENT,
        currency: null,
        error: { code: 'card_declined', message: 'Declined' },
      }),
    )
    expect(t.amount).toBeUndefined()
    expect(t.errorCode).toBe('card_declined')
    expect(t.errorMessage).toBe('Declined')
  })
})
