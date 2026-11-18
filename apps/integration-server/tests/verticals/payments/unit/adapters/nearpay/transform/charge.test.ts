/**
 * NearPay transaction -> canonical Charge.
 *
 * The fixture is the documented List Transactions / Find Transaction example
 * (https://docs.nearpay.io/sa/en/api-endpoints/accounts-api, "Transactions"),
 * trimmed to the fields the transform reads plus a few it must ignore.
 */
import { describe, it, expect } from 'vitest'
import {
  isPurchase,
  transformCharge,
  type RawNearpayTransaction,
} from '../../../../../../../src/verticals/payments/adapters/nearpay/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

function documentedTransaction(): RawNearpayTransaction {
  return {
    id: 'f2190ab9-3048-4364-a6f7-ce3ce53a3b16',
    created_at: '2023-09-28T08:54:49.563Z',
    is_reconcilied: false,
    terminal: { tid: '1881001155119328' },
    receipts: [
      {
        id: '519a01ef-7c01-4a79-9b60-bc69a7cb2158',
        type: 'purchase',
        transaction_type: { name: { arabic: 'شراء', english: 'PURCHASE' }, id: '00' },
        amount_authorized: {
          label: { arabic: 'مبلغ الشراء', english: 'PURCHASE AMOUNT' },
          value: '0.01',
        },
        amount_other: { label: { arabic: 'مبلغ النقد', english: 'NAQD AMOUNT' }, value: '0.00' },
        currency: { arabic: '', english: 'SAR' },
        status_message: { arabic: 'مرفوضة', english: 'ERROR' },
        is_approved: false,
        is_refunded: false,
        is_reversed: false,
        approval_code: null,
        transaction_uuid: 'f2190ab9-3048-4364-a6f7-ce3ce53a3b16',
        created_at: '2023-09-28T08:54:49.647Z',
        updated_at: '2023-09-28T08:54:49.647Z',
      },
    ],
    customer_reference_number: null,
  }
}

function withReceipt(patch: Record<string, unknown>): RawNearpayTransaction {
  const t = documentedTransaction()
  t.receipts = [{ ...t.receipts![0]!, ...patch }]
  return t
}

describe('nearpay transformCharge', () => {
  it('maps the documented example and parses as a Charge', () => {
    const raw = documentedTransaction()
    const c = ChargeSchema.parse(transformCharge(raw))
    expect(c.id).toBe('f2190ab9-3048-4364-a6f7-ce3ce53a3b16')
    expect(c.externalId).toBe('f2190ab9-3048-4364-a6f7-ce3ce53a3b16')
    // "0.01" SAR (major units, 2 decimals) is 1 halala.
    expect(c.amount).toBe(1)
    expect(c.currency).toBe('SAR')
    // is_approved false, not refunded or reversed.
    expect(c.status).toBe('failed')
    expect(c.gateway).toBe('nearpay')
    expect(c.createdAt).toBe('2023-09-28T08:54:49.563Z')
    expect(c.updatedAt).toBe('2023-09-28T08:54:49.647Z')
    expect(c.metadata).toEqual({})
    expect(c.raw).toBe(raw)
  })

  it('scales the decimal amount by the currency exponent', () => {
    const c = ChargeSchema.parse(
      transformCharge(withReceipt({ amount_authorized: { value: '125.50' } })),
    )
    expect(c.amount).toBe(12550)
  })

  it('maps is_approved true to succeeded', () => {
    const c = ChargeSchema.parse(transformCharge(withReceipt({ is_approved: true })))
    expect(c.status).toBe('succeeded')
  })

  it('maps is_refunded to refunded, ahead of is_approved', () => {
    const c = ChargeSchema.parse(
      transformCharge(withReceipt({ is_approved: true, is_refunded: true })),
    )
    expect(c.status).toBe('refunded')
  })

  it('maps is_reversed to cancelled, ahead of is_approved', () => {
    const c = ChargeSchema.parse(
      transformCharge(withReceipt({ is_approved: true, is_reversed: true })),
    )
    expect(c.status).toBe('cancelled')
  })

  it('carries customer_reference_number into metadata when set', () => {
    const t = documentedTransaction()
    t.customer_reference_number = 'INV-100245'
    const c = ChargeSchema.parse(transformCharge(t))
    expect(c.metadata).toEqual({ customer_reference_number: 'INV-100245' })
  })

  it('throws rather than inventing an amount when the transaction has no receipt', () => {
    const t = documentedTransaction()
    t.receipts = []
    expect(() => transformCharge(t)).toThrow(/receipt/)
  })

  it('throws rather than defaulting a currency', () => {
    expect(() => transformCharge(withReceipt({ currency: { arabic: '', english: '' } }))).toThrow(
      /currency/,
    )
  })

  it('throws rather than writing amount 0 for a missing amount', () => {
    expect(() => transformCharge(withReceipt({ amount_authorized: { value: null } }))).toThrow(
      /amount/,
    )
  })

  it('reads the first receipt, not a later one', () => {
    const t = documentedTransaction()
    t.receipts = [
      t.receipts![0]!,
      { ...t.receipts![0]!, amount_authorized: { value: '9.99' }, is_approved: true },
    ]
    const c = ChargeSchema.parse(transformCharge(t))
    expect(c.amount).toBe(1)
    expect(c.status).toBe('failed')
  })

  it('isPurchase is true only for a "purchase" receipt type', () => {
    expect(isPurchase(documentedTransaction())).toBe(true)
    expect(isPurchase(withReceipt({ type: 'refund' }))).toBe(false)
    expect(() => isPurchase(withReceipt({ type: undefined }))).toThrow(/receipt type/)
  })

  it('throws on a missing transaction id', () => {
    const t = documentedTransaction()
    delete t.id
    expect(() => transformCharge(t)).toThrow(/id/)
  })
})
