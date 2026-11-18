import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  untransformTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/zid/transform/transaction'
import type { RawZidOrder } from '../../../../../../../src/verticals/ecommerce/adapters/zid/transform/order'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeOrder(overrides: Partial<RawZidOrder> = {}): RawZidOrder {
  return {
    id: 8001,
    invoice_number: 1042,
    currency_code: 'SAR',
    order_status: { code: 'delivered', name: 'Delivered' },
    payment_status: 'paid',
    order_total: '350.00',
    payment: {
      method: { name: 'Mada', code: 'mada' },
    },
    issue_date: '2026-01-15T09:30:00Z',
    created_at: '2026-01-15T09:30:00Z',
    updated_at: '2026-01-17T16:45:00Z',
    ...overrides,
  }
}

describe('transformTransaction (Zid)', () => {
  it('synthesises id as txn:{orderId}', () => {
    const result = transformTransaction(makeOrder())
    expect(result.id).toBe('txn:8001')
  })

  it('maps order id to orderId', () => {
    const result = transformTransaction(makeOrder())
    expect(result.orderId).toBe('8001')
  })

  it('sets kind to SALE for paid payment_status', () => {
    const result = transformTransaction(makeOrder({ payment_status: 'paid' }))
    expect(result.kind).toBe('SALE')
  })

  it('sets kind to REFUND for refunded payment_status', () => {
    const result = transformTransaction(makeOrder({ payment_status: 'refunded' }))
    expect(result.kind).toBe('REFUND')
  })

  it('maps paid payment_status to SUCCESS status', () => {
    const result = transformTransaction(makeOrder({ payment_status: 'paid' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps refunded payment_status to SUCCESS status', () => {
    const result = transformTransaction(makeOrder({ payment_status: 'refunded' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps pending payment_status to PENDING status', () => {
    const result = transformTransaction(makeOrder({ payment_status: 'pending' }))
    expect(result.status).toBe('PENDING')
  })

  it('converts major-unit order_total to minor units for amount (SAR × 100)', () => {
    const result = transformTransaction(makeOrder())
    // 350 SAR = 35000 halalas
    expect(result.amount).toEqual({ amount: 35000, currency: 'SAR' })
  })

  it('maps payment method name to gateway', () => {
    const result = transformTransaction(makeOrder())
    expect(result.gateway).toBe('Mada')
  })

  it('prefers transaction_reference for authorizationCode when present', () => {
    const result = transformTransaction(
      makeOrder({ transaction_reference: 'AUTH-REF-001' } as Partial<RawZidOrder>),
    )
    expect(result.authorizationCode).toBe('AUTH-REF-001')
  })

  it('uses issue_date as processedAt', () => {
    const result = transformTransaction(makeOrder())
    expect(result.processedAt).toBe('2026-01-15T09:30:00Z')
  })

  it('maps created_at to createdAt', () => {
    const result = transformTransaction(makeOrder())
    expect(result.createdAt).toBe('2026-01-15T09:30:00Z')
  })

  it('leaves amount undefined when order_total is 0', () => {
    const result = transformTransaction(makeOrder({ order_total: '0' }))
    expect(result.amount).toBeUndefined()
  })

  it('stores raw in metadata', () => {
    const raw = makeOrder()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying TransactionSchema', () => {
    const result = transformTransaction(makeOrder())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})

describe('untransformTransaction (Zid)', () => {
  it('maps amount to transaction_amount and currency to currency_code', () => {
    const body = untransformTransaction({ amount: { amount: 35000, currency: 'SAR' } })
    expect(body.transaction_amount).toBe(35000)
    expect(body.currency_code).toBe('SAR')
  })
})
