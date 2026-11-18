import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawVndaOrderForTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/vnda/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeOrder(
  overrides: Partial<RawVndaOrderForTransaction> = {},
): RawVndaOrderForTransaction {
  return {
    id: 1042,
    status: 'processing',
    currency: 'BRL',
    total: '199.90',
    payment_method: 'pix',
    payment_method_title: 'PIX',
    date_paid_gmt: '2026-01-15T09:30:00.000Z',
    date_created_gmt: '2026-01-15T09:00:00.000Z',
    ...overrides,
  }
}

describe('transformTransaction (VNDA)', () => {
  it('prefixes id with txn_ and sets orderId to string order id', () => {
    const result = transformTransaction(makeOrder())
    expect(result.id).toBe('txn_1042')
    expect(result.orderId).toBe('1042')
  })

  it('maps status=processing to kind=SALE and status=SUCCESS', () => {
    const result = transformTransaction(makeOrder({ status: 'processing' }))
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps status=refunded to kind=REFUND and status=SUCCESS', () => {
    const result = transformTransaction(makeOrder({ status: 'refunded' }))
    expect(result.kind).toBe('REFUND')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps status=failed to FAILURE', () => {
    expect(transformTransaction(makeOrder({ status: 'failed' })).status).toBe('FAILURE')
  })

  it('maps unknown status to PENDING', () => {
    expect(transformTransaction(makeOrder({ status: 'on-hold' })).status).toBe('PENDING')
  })

  it('converts total from major units to minor units in BRL', () => {
    const result = transformTransaction(makeOrder())
    expect(result.amount).toEqual({ amount: 19990, currency: 'BRL' })
  })

  it('defaults currency to BRL when missing', () => {
    const result = transformTransaction(makeOrder({ currency: undefined }))
    expect(result.amount!.currency).toBe('BRL')
  })

  it('maps gateway from payment_method', () => {
    const result = transformTransaction(makeOrder())
    expect(result.gateway).toBe('pix')
  })

  it('maps processedAt from date_paid_gmt', () => {
    const result = transformTransaction(makeOrder())
    expect(result.processedAt).toBe('2026-01-15T09:30:00.000Z')
  })

  it('maps createdAt from date_created_gmt', () => {
    const result = transformTransaction(makeOrder())
    expect(result.createdAt).toBe('2026-01-15T09:00:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying TransactionSchema', () => {
    const result = transformTransaction(makeOrder())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
