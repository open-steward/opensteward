import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawMeliPayment,
} from '../../../../../../../src/verticals/ecommerce/adapters/mercadolibre/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makePayment(overrides: Partial<RawMeliPayment> = {}): RawMeliPayment {
  return {
    id: 50000001,
    order_id: 4000000001,
    status: 'approved',
    status_detail: 'accredited',
    transaction_amount: 45000,
    currency_id: 'ARS',
    date_created: '2024-05-01T10:02:00.000Z',
    date_approved: '2024-05-01T10:05:00.000Z',
    payment_method_id: 'account_money',
    payment_type: 'account_money',
    authorization_code: 'AUTH-12345',
    ...overrides,
  }
}

describe('transformTransaction (Mercado Libre)', () => {
  it('uses payment ID as canonical id', () => {
    const result = transformTransaction(makePayment())
    expect(result.id).toBe('50000001')
  })

  it('maps orderId as string', () => {
    const result = transformTransaction(makePayment())
    expect(result.orderId).toBe('4000000001')
  })

  it('maps approved status to SALE kind and SUCCESS status', () => {
    const result = transformTransaction(makePayment())
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps pending status correctly', () => {
    const result = transformTransaction(makePayment({ status: 'pending' }))
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('PENDING')
  })

  it('maps refunded status to REFUND kind', () => {
    const result = transformTransaction(makePayment({ status: 'refunded' }))
    expect(result.kind).toBe('REFUND')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps cancelled status to VOID kind', () => {
    const result = transformTransaction(makePayment({ status: 'cancelled' }))
    expect(result.kind).toBe('VOID')
    expect(result.status).toBe('FAILURE')
  })

  it('maps rejected status to FAILURE', () => {
    const result = transformTransaction(makePayment({ status: 'rejected' }))
    expect(result.status).toBe('FAILURE')
  })

  it('maps charged_back status to REFUND', () => {
    const result = transformTransaction(makePayment({ status: 'charged_back' }))
    expect(result.kind).toBe('REFUND')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps amount with currency', () => {
    const result = transformTransaction(makePayment())
    expect(result.amount).toEqual({ amount: 45000, currency: 'ARS' })
  })

  it('uses payment_method_id as gateway', () => {
    const result = transformTransaction(makePayment())
    expect(result.gateway).toBe('account_money')
  })

  it('defaults gateway to mercadopago when payment_method_id is missing', () => {
    const result = transformTransaction(makePayment({ payment_method_id: undefined }))
    expect(result.gateway).toBe('mercadopago')
  })

  it('maps authorization code', () => {
    const result = transformTransaction(makePayment())
    expect(result.authorizationCode).toBe('AUTH-12345')
  })

  it('uses date_approved as processedAt', () => {
    const result = transformTransaction(makePayment())
    expect(result.processedAt).toBe('2024-05-01T10:05:00.000Z')
  })

  it('falls back to date_created when date_approved is missing', () => {
    const result = transformTransaction(makePayment({ date_approved: undefined }))
    expect(result.processedAt).toBe('2024-05-01T10:02:00.000Z')
  })

  it('handles missing orderId', () => {
    const result = transformTransaction(makePayment({ order_id: undefined }))
    expect(result.orderId).toBeUndefined()
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    const result = transformTransaction(makePayment())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makePayment()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })
})
