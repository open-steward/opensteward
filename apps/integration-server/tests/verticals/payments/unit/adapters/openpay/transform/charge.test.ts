/**
 * Fixture: the "Listado de cargos" example response
 * (https://documents.openpay.mx/docs/api/index.html).
 */
import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawOpenpayCharge,
} from '../../../../../../../src/verticals/payments/adapters/openpay/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

const DOC_CARD: RawOpenpayCharge = {
  id: 'tryqihxac3msedn4yxed',
  amount: 100.0,
  authorization: '801585',
  method: 'card',
  operation_type: 'in',
  transaction_type: 'charge',
  card: {
    type: 'debit',
    brand: 'visa',
    address: null,
    card_number: '411111XXXXXX1111',
    holder_name: 'Juan Perez Ramirez',
    expiration_year: '20',
    expiration_month: '12',
    allows_charges: true,
    allows_payouts: true,
    bank_name: 'Banamex',
    bank_code: '002',
  },
  status: 'completed',
  currency: 'MXN',
  creation_date: '2014-05-26T14:00:17-05:00',
  operation_date: '2014-05-26T14:00:17-05:00',
  description: 'Cargo inicial a mi cuenta',
  error_message: null,
  order_id: null,
  customer_id: 'ag4nktpdzebjiye1tlze',
}

const DOC_BANK: RawOpenpayCharge = {
  id: 'trnzf2xjwpupjfryyj23',
  amount: 100.0,
  authorization: null,
  method: 'bank_account',
  operation_type: 'in',
  transaction_type: 'charge',
  status: 'in_progress',
  currency: 'MXN',
  creation_date: '2014-05-26T13:51:25-05:00',
  operation_date: '2014-05-26T13:51:25-05:00',
  description: 'Cargo con banco',
  error_message: null,
  order_id: 'oid-00055',
  customer_id: 'ag4nktpdzebjiye1tlze',
}

describe('openpay transformCharge', () => {
  it('maps the documented completed card charge', () => {
    const r = ChargeSchema.parse(transformCharge(DOC_CARD))
    expect(r.id).toBe('tryqihxac3msedn4yxed')
    expect(r.amount).toBe(10000)
    expect(r.currency).toBe('MXN')
    expect(r.status).toBe('succeeded')
    expect(r.customerId).toBe('ag4nktpdzebjiye1tlze')
    expect(r.description).toBe('Cargo inicial a mi cuenta')
    expect(r.createdAt).toBe('2014-05-26T14:00:17-05:00')
    expect(r.metadata).toEqual({})
  })

  it('maps the documented in_progress bank charge', () => {
    const r = ChargeSchema.parse(transformCharge(DOC_BANK))
    expect(r.status).toBe('pending')
    expect(r.metadata).toEqual({ order_id: 'oid-00055' })
  })

  it.each([
    ['failed', 'failed'],
    ['REFUNDED', 'refunded'],
    ['CANCELLED', 'cancelled'],
    ['CHARGEBACK_PENDING', 'disputed'],
    ['CHARGE_PENDING', 'pending'],
    ['something_else', 'unknown'],
  ])('maps status %s to %s', (status, expected) => {
    expect(ChargeSchema.parse(transformCharge({ ...DOC_CARD, status })).status).toBe(expected)
  })

  it('carries error_message as failureMessage', () => {
    const r = transformCharge({ ...DOC_CARD, status: 'failed', error_message: 'Tarjeta declinada' })
    expect(r.failureMessage).toBe('Tarjeta declinada')
  })

  it('never defaults a missing currency or amount', () => {
    const { currency: _c, ...noCurrency } = DOC_CARD
    expect(() => transformCharge(noCurrency)).toThrow(/no currency/)
    const { amount: _a, ...noAmount } = DOC_CARD
    expect(() => transformCharge(noAmount)).toThrow(/no numeric amount/)
  })

  it('never defaults a missing id', () => {
    const { id: _i, ...rest } = DOC_CARD
    expect(() => transformCharge(rest)).toThrow(/no id/)
  })
})
