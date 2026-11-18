/**
 * OTTO Market Receipt → canonical Transaction (read-only).
 *
 * Docs: https://api.otto.market/docs/functional-interfaces/receipts
 * Confirmed: `receiptNumber` (also the `GET /v3/receipts/{receiptNumber}`
 * path parameter), `receiptType` (PURCHASE | REFUND | PARTIAL_REFUND),
 * `salesOrderId`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawOttoReceipt,
} from '../../../../../../../src/verticals/ecommerce/adapters/otto-market/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeReceipt(overrides: Partial<RawOttoReceipt> = {}): RawOttoReceipt {
  return {
    receiptNumber: 'rcpt-1',
    receiptType: 'PURCHASE',
    salesOrderId: 'so-1001',
    receiptDate: '2026-02-06T00:00:00Z',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('uses receiptNumber as the id — the confirmed path parameter', () => {
    expect(transformTransaction(makeReceipt()).id).toBe('rcpt-1')
  })

  it('maps PURCHASE → SALE and REFUND/PARTIAL_REFUND → REFUND', () => {
    expect(transformTransaction(makeReceipt({ receiptType: 'PURCHASE' })).kind).toBe('SALE')
    expect(transformTransaction(makeReceipt({ receiptType: 'REFUND' })).kind).toBe('REFUND')
    expect(transformTransaction(makeReceipt({ receiptType: 'PARTIAL_REFUND' })).kind).toBe('REFUND')
  })

  it('omits amount — never defaults it — when no amount field is found', () => {
    expect(transformTransaction(makeReceipt()).amount).toBeUndefined()
  })

  it('extracts an object-shaped amount when present', () => {
    const result = transformTransaction(makeReceipt({ amount: { amount: 4999, currency: 'EUR' } }))
    expect(result.amount).toEqual({ amount: 4999, currency: 'EUR' })
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeReceipt()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    expect(() => TransactionSchema.parse(transformTransaction(makeReceipt()))).not.toThrow()
  })
})
