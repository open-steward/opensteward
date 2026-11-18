/**
 * Fixtures are the documented examples for GET /v1/withdraw_requests
 * (https://dev.iugu.com/reference/listar-transferencia-bancaria) and
 * GET /v1/withdraw_requests/{id}
 * (https://dev.iugu.com/reference/buscar-transferencia-bancaria).
 */
import { describe, it, expect } from 'vitest'
import {
  parseIuguAmount,
  transformPayout,
  type RawIuguWithdrawRequest,
} from '../../../../../../../src/verticals/payments/adapters/iugu/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

const LISTED: RawIuguWithdrawRequest = {
  id: '4194D625A1894FAFAB2478DC333DAF0D',
  status: 'rejected',
  created_at: '2024-06-13T09:10:55-03:00',
  updated_at: '2024-06-14T10:11:03-03:00',
  reference: 'core:transfer:17ctElpMA77H9gJvWtexma',
  feedback: "Código: '2' - Agência ou Conta Destinatária do Crédito Inválida",
  paying_at: '2024-06-14',
  custom_variables: [],
  amount: 'R$ 5,00',
  account_name: 'Nome da Conta',
  account_id: '44C5DC6376804D1FA792CBCA382105C1',
  receipt_url: 'https://comprovantes.iugu.com/4194d625-a189-4faf-ab24-78dc333daf0d-d94ba',
  agreement_effect: false,
  bank_address: {
    bank: 'Santander',
    bank_cc: '01010-1',
    bank_ag: '0003',
    account_type: 'Corrente',
  },
}

const FETCHED: RawIuguWithdrawRequest = {
  id: '530706A3862D4BB49C8AC9637B850CDE',
  status: 'pending',
  created_at: '2015-11-26T10:02:23-02:00',
  updated_at: '2015-11-26T10:02:23-02:00',
  reference: null,
  amount: 'R$ 10,00',
  account_name: 'Conta',
  account_id: 'A682CECA59D74527B984CA529D7C2ED4',
  feedback: null,
  bank_address: { bank: 'Bradesco', bank_cc: '11231-2', bank_ag: '1234', account_type: 'Corrente' },
}

describe('iugu transformPayout', () => {
  it('maps the documented list example', () => {
    const result = PayoutSchema.parse(transformPayout(LISTED))
    expect(result).toMatchObject({
      id: '4194D625A1894FAFAB2478DC333DAF0D',
      externalId: '4194D625A1894FAFAB2478DC333DAF0D',
      amount: 500,
      currency: 'BRL',
      status: 'failed',
      failureMessage: "Código: '2' - Agência ou Conta Destinatária do Crédito Inválida",
      gateway: 'iugu',
      metadata: {},
      createdAt: '2024-06-13T09:10:55-03:00',
      updatedAt: '2024-06-14T10:11:03-03:00',
    })
    // paying_at is a bare date; the canonical arrivalDate is a date-time.
    expect(result.arrivalDate).toBeUndefined()
  })

  it('maps the documented get example (null feedback)', () => {
    const result = PayoutSchema.parse(transformPayout(FETCHED))
    expect(result.amount).toBe(1000)
    expect(result.status).toBe('pending')
    expect(result.failureMessage).toBeUndefined()
  })

  it.each([
    ['pending', 'pending'],
    ['processing', 'in_transit'],
    ['reprocessing', 'in_transit'],
    ['accepted', 'paid'],
    ['rejected', 'failed'],
    ['inconsistent', 'unknown'],
    ['refunded', 'unknown'],
    ['partially_refunded', 'unknown'],
  ])('maps documented status %s to %s', (status, expected) => {
    const result = PayoutSchema.parse(transformPayout({ ...FETCHED, status }))
    expect(result.status).toBe(expected)
  })

  it('throws the parser error, not a TypeError, on a record with no amount', () => {
    const { amount: _omit, ...noAmount } = FETCHED
    expect(() => transformPayout(noAmount as RawIuguWithdrawRequest)).toThrow(
      /unrecognised amount undefined/,
    )
  })

  it('throws on a record with no id rather than inventing one', () => {
    expect(() => transformPayout({ ...FETCHED, id: '' })).toThrow(/without an id/)
  })
})

describe('iugu parseIuguAmount', () => {
  it.each([
    ['R$ 5,00', 500],
    ['R$ 10,00', 1000],
    ['R$ 0,07', 7],
    ['R$ 1.234,56', 123456],
    ['R$ 1.000.000,00', 100000000],
    ['R$ 12,30', 1230],
  ])('reads %s as %i minor units of BRL', (s, cents) => {
    expect(parseIuguAmount(s)).toEqual({ amount: cents, currency: 'BRL' })
  })

  it.each(['5,00', 'US$ 5,00', 'R$ 5', 'R$ 5.00', 'R$ 12.34,56', ''])(
    'refuses %j instead of guessing',
    (s) => {
      expect(() => parseIuguAmount(s)).toThrow(/unrecognised amount/)
    },
  )
})
