import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawCafe24Payment,
} from '../../../../../../../src/verticals/ecommerce/adapters/cafe24/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

describe('transformTransaction (cafe24)', () => {
  const raw: RawCafe24Payment = {
    id: '20240301-0000001:payment',
    order_id: '20240301-0000001',
    payment_method: 'card',
    payment_gateway_name: 'KakaoPay',
    payment_status: 'payment_complete',
    actual_price: 52500,
    currency: 'KRW',
    order_date: '2024-03-01T00:00:00Z',
  }

  it('maps id from provided id field', () => {
    expect(transformTransaction(raw).id).toBe('20240301-0000001:payment')
  })

  it('synthesises id as orderId:payment when id absent', () => {
    const result = transformTransaction({ ...raw, id: null })
    expect(result.id).toBe('20240301-0000001:payment')
  })

  it('maps orderId', () => {
    expect(transformTransaction(raw).orderId).toBe('20240301-0000001')
  })

  it('infers kind as SALE for payment_complete status', () => {
    expect(transformTransaction(raw).kind).toBe('SALE')
  })

  it('infers kind as REFUND when status contains "refund"', () => {
    const result = transformTransaction({ ...raw, payment_status: 'refund_complete' })
    expect(result.kind).toBe('REFUND')
  })

  it('infers kind as VOID when status contains "cancel"', () => {
    const result = transformTransaction({ ...raw, payment_status: 'payment_cancel' })
    expect(result.kind).toBe('VOID')
  })

  it('maps status payment_complete → SUCCESS', () => {
    expect(transformTransaction(raw).status).toBe('SUCCESS')
  })

  it('maps status awaiting_payment → PENDING', () => {
    const result = transformTransaction({ ...raw, payment_status: 'awaiting_payment' })
    expect(result.status).toBe('PENDING')
  })

  it('maps status payment_cancel → FAILURE', () => {
    const result = transformTransaction({ ...raw, payment_status: 'payment_cancel' })
    expect(result.status).toBe('FAILURE')
  })

  it('converts actual_price to minor units (KRW: major=minor)', () => {
    expect(transformTransaction(raw).amount?.amount).toBe(52500)
    expect(transformTransaction(raw).amount?.currency).toBe('KRW')
  })

  it('maps gateway from payment_gateway_name', () => {
    expect(transformTransaction(raw).gateway).toBe('KakaoPay')
  })

  it('falls back to payment_method for gateway', () => {
    const result = transformTransaction({ ...raw, payment_gateway_name: null })
    expect(result.gateway).toBe('card')
  })

  it('maps processedAt and createdAt from order_date', () => {
    // toIsoDatetime normalizes to include milliseconds
    const result = transformTransaction(raw)
    expect(result.processedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('handles null actual_price', () => {
    const result = transformTransaction({ ...raw, actual_price: null })
    expect(result.amount).toBeUndefined()
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })

  it('passes TransactionSchema validation', () => {
    expect(() => TransactionSchema.parse(transformTransaction(raw))).not.toThrow()
  })
})
