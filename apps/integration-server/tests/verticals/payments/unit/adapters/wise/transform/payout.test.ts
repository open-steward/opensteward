/**
 * Fixture: the documented `transfer` schema of GET /v1/transfers
 * (https://docs.wise.com/api-reference/legacy/standard-transfer/transferlist),
 * built from its property examples.
 */
import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawWiseTransfer,
} from '../../../../../../../src/verticals/payments/adapters/wise/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

function documented(overrides: Partial<RawWiseTransfer> = {}): RawWiseTransfer {
  return {
    id: 16521632,
    user: 4342275,
    targetAccount: 8692237,
    sourceAccount: null,
    quote: null,
    quoteUuid: '8fa9be20-ba43-4b15-abbb-9424e1481050',
    status: 'incoming_payment_waiting',
    reference: 'reference text',
    rate: 0.89,
    created: '2017-11-24 10:47:49',
    business: null,
    transferRequest: null,
    details: { reference: 'Testing' },
    hasActiveIssues: false,
    sourceCurrency: 'EUR',
    sourceValue: 0,
    targetCurrency: 'GBP',
    targetValue: 150,
    customerTransactionId: '54a6bc09-cef9-49a8-9041-f1f0c654cd88',
    payinSessionId: '23330542-8e9e-419f-95eb-312b880f92ad',
    ...overrides,
  }
}

describe('wise transformPayout', () => {
  it('maps the documented transfer example', () => {
    const raw = documented()
    const result = PayoutSchema.parse(transformPayout(raw))
    expect(result.id).toBe('16521632')
    expect(result.externalId).toBe('16521632')
    expect(result.amount).toBe(15000)
    expect(result.currency).toBe('GBP')
    expect(result.status).toBe('pending')
    expect(result.statementDescriptor).toBe('Testing')
    expect(result.gateway).toBe('wise')
    expect(result.metadata).toEqual({})
    expect(result.raw).toBe(raw)
  })

  it('scales targetValue by the target currency exponent', () => {
    const r = PayoutSchema.parse(
      transformPayout(documented({ targetValue: 1000, targetCurrency: 'JPY' })),
    )
    expect(r.amount).toBe(1000)
    expect(r.currency).toBe('JPY')
  })

  it('leaves out createdAt for the documented zone-less timestamp', () => {
    expect(transformPayout(documented()).createdAt).toBeUndefined()
  })

  it('keeps a created timestamp that names its zone', () => {
    const r = PayoutSchema.parse(transformPayout(documented({ created: '2017-11-24T10:47:49Z' })))
    expect(r.createdAt).toBe('2017-11-24T10:47:49.000Z')
  })

  it.each([
    ['incoming_payment_waiting', 'pending'],
    ['incoming_payment_initiated', 'pending'],
    ['processing', 'pending'],
    ['funds_converted', 'pending'],
    ['outgoing_payment_sent', 'paid'],
    ['cancelled', 'cancelled'],
    ['funds_refunded', 'cancelled'],
    ['bounced_back', 'pending'],
    ['charged_back', 'failed'],
    ['unknown', 'unknown'],
    ['something_new', 'unknown'],
  ])('maps status %s to %s', (status, expected) => {
    expect(PayoutSchema.parse(transformPayout(documented({ status }))).status).toBe(expected)
  })

  it('throws instead of inventing an amount or currency', () => {
    const noValue = documented()
    delete noValue.targetValue
    expect(() => transformPayout(noValue)).toThrow(/targetValue/)
    const noCurrency = documented()
    delete noCurrency.targetCurrency
    expect(() => transformPayout(noCurrency)).toThrow(/targetCurrency/)
  })
})
