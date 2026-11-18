import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  untransformTransaction,
  type RawCentraOrderPayment,
} from '../../../../../../../src/verticals/ecommerce/adapters/centra/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makePayment(overrides: Partial<RawCentraOrderPayment> = {}): RawCentraOrderPayment {
  return {
    orderId: 1001,
    paymentPlugin: 'Klarna',
    paymentType: 'invoice',
    paymentDescription: 'Klarna Invoice',
    paymentReference: 'KLARNAREF_XYZ',
    grandTotalValue: '1249.00',
    currency: 'SEK',
    shouldCapture: false,
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('synthesises id as "orderId:payment"', () => {
    const result = transformTransaction(makePayment())
    expect(result.id).toBe('1001:payment')
  })

  it('maps orderId to string', () => {
    const result = transformTransaction(makePayment())
    expect(result.orderId).toBe('1001')
  })

  it('sets kind to CAPTURE when shouldCapture is false', () => {
    const result = transformTransaction(makePayment({ shouldCapture: false }))
    expect(result.kind).toBe('CAPTURE')
  })

  it('sets kind to AUTHORIZATION when shouldCapture is true', () => {
    const result = transformTransaction(makePayment({ shouldCapture: true }))
    expect(result.kind).toBe('AUTHORIZATION')
  })

  it('sets status to SUCCESS when shouldCapture is false', () => {
    const result = transformTransaction(makePayment())
    expect(result.status).toBe('SUCCESS')
  })

  it('sets status to PENDING when shouldCapture is true', () => {
    const result = transformTransaction(makePayment({ shouldCapture: true }))
    expect(result.status).toBe('PENDING')
  })

  it('converts grandTotalValue to minor units (SEK)', () => {
    // 1249.00 SEK → 124900 minor units
    const result = transformTransaction(makePayment())
    expect(result.amount).toEqual({ amount: 124900, currency: 'SEK' })
  })

  it('maps paymentPlugin to gateway', () => {
    const result = transformTransaction(makePayment())
    expect(result.gateway).toBe('Klarna')
  })

  it('maps paymentReference to authorizationCode', () => {
    const result = transformTransaction(makePayment())
    expect(result.authorizationCode).toBe('KLARNAREF_XYZ')
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    const result = transformTransaction(makePayment())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformTransaction', () => {
    const canonical = transformTransaction(makePayment())
    const raw = untransformTransaction(canonical)
    expect(raw.paymentPlugin).toBe('Klarna')
    expect(raw.paymentReference).toBe('KLARNAREF_XYZ')
  })
})
