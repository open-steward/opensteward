import { describe, it, expect } from 'vitest'
import { transformTransaction } from '../../../../../../../src/verticals/ecommerce/adapters/loyverse/transform/transaction'
import type { RawLoyversePayment } from '../../../../../../../src/verticals/ecommerce/adapters/loyverse/transform/order'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeRaw(overrides: Partial<RawLoyversePayment> = {}): RawLoyversePayment {
  return {
    payment_type_id: 'ptype_cash',
    name: 'Cash',
    money_amount: 19.98,
    ...overrides,
  }
}

describe('transformTransaction (Loyverse)', () => {
  it('synthesizes id as receiptNumber:paymentTypeId:index', () => {
    const result = transformTransaction(makeRaw(), 'RCP-1042', 0)
    expect(result.id).toBe('RCP-1042:ptype_cash:0')
  })

  it('uses "payment" fallback in id when payment_type_id is absent', () => {
    const result = transformTransaction(makeRaw({ payment_type_id: undefined }), 'RCP-1042', 1)
    expect(result.id).toBe('RCP-1042:payment:1')
  })

  it('maps orderId to receiptNumber', () => {
    const result = transformTransaction(makeRaw(), 'RCP-1042', 0)
    expect(result.orderId).toBe('RCP-1042')
  })

  it('sets kind to SALE', () => {
    const result = transformTransaction(makeRaw(), 'RCP-1042', 0)
    expect(result.kind).toBe('SALE')
  })

  it('sets status to SUCCESS', () => {
    const result = transformTransaction(makeRaw(), 'RCP-1042', 0)
    expect(result.status).toBe('SUCCESS')
  })

  it('converts money_amount from major to minor units', () => {
    const result = transformTransaction(makeRaw({ money_amount: 19.98 }), 'RCP-1042', 0)
    expect(result.amount).toEqual({ amount: 1998, currency: 'USD' })
  })

  it('omits amount when money_amount is null', () => {
    const result = transformTransaction(makeRaw({ money_amount: undefined }), 'RCP-1042', 0)
    expect(result.amount).toBeUndefined()
  })

  it('maps gateway from name', () => {
    const result = transformTransaction(makeRaw({ name: 'Credit Card' }), 'RCP-1042', 0)
    expect(result.gateway).toBe('Credit Card')
  })

  it('falls back to payment_type_id for gateway when name is absent', () => {
    const result = transformTransaction(makeRaw({ name: undefined }), 'RCP-1042', 0)
    expect(result.gateway).toBe('ptype_cash')
  })

  it('accepts explicit currency', () => {
    const result = transformTransaction(makeRaw(), 'RCP-1042', 0, 'EUR')
    expect(result.amount?.currency).toBe('EUR')
  })

  it('increments id by index', () => {
    const r0 = transformTransaction(makeRaw(), 'RCP-1042', 0)
    const r1 = transformTransaction(makeRaw(), 'RCP-1042', 1)
    expect(r0.id).toBe('RCP-1042:ptype_cash:0')
    expect(r1.id).toBe('RCP-1042:ptype_cash:1')
  })

  it('produces schema-valid output', () => {
    const result = transformTransaction(makeRaw(), 'RCP-1042', 0)
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })

  it('produces schema-valid output with minimal input', () => {
    const result = transformTransaction({}, 'RCP-MIN', 0)
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
