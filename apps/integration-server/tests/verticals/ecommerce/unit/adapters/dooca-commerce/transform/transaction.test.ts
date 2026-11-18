import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawDoocaPayment,
} from '../../../../../../../src/verticals/ecommerce/adapters/dooca-commerce/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makePayment(overrides: Partial<RawDoocaPayment> = {}): RawDoocaPayment {
  return {
    id: 88,
    order_id: 500,
    name: 'Credit Card',
    method: 'creditcard',
    status: 'approved',
    parcels: 3,
    parcel_price: '10.00',
    nsu: 'NSU12345',
    processed_at: '2024-03-01T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformTransaction (Dooca Commerce)', () => {
  it('maps id as string', () => {
    const result = transformTransaction(makePayment({ id: 88 }))
    expect(result.id).toBe('88')
  })

  it('maps orderId from order_id', () => {
    const result = transformTransaction(makePayment())
    expect(result.orderId).toBe('500')
  })

  it('uses explicit orderId parameter over raw order_id', () => {
    const result = transformTransaction(makePayment(), 'explicit-999')
    expect(result.orderId).toBe('explicit-999')
  })

  it('always maps kind to SALE', () => {
    const result = transformTransaction(makePayment({ method: 'billet' }))
    expect(result.kind).toBe('SALE')
  })

  it('maps status "approved" to SUCCESS', () => {
    const result = transformTransaction(makePayment({ status: 'approved' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps status "paid" to SUCCESS', () => {
    const result = transformTransaction(makePayment({ status: 'paid' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps status "pending" to PENDING', () => {
    const result = transformTransaction(makePayment({ status: 'pending' }))
    expect(result.status).toBe('PENDING')
  })

  it('maps status "denied" to FAILURE', () => {
    const result = transformTransaction(makePayment({ status: 'denied' }))
    expect(result.status).toBe('FAILURE')
  })

  it('calculates amount as parcel_price × parcels', () => {
    // parcel_price=10.00, parcels=3 → 30.00 BRL = 3000 minor units
    const result = transformTransaction(makePayment({ parcel_price: '10.00', parcels: 3 }))
    expect(result.amount).toEqual({ amount: 3000, currency: 'BRL' })
  })

  it('maps gateway from name field', () => {
    const result = transformTransaction(makePayment())
    expect(result.gateway).toBe('Credit Card')
  })

  it('maps authorizationCode from nsu', () => {
    const result = transformTransaction(makePayment({ nsu: 'NSU12345' }))
    expect(result.authorizationCode).toBe('NSU12345')
  })

  it('falls back to gateway_id when nsu is absent', () => {
    const result = transformTransaction(makePayment({ nsu: null, gateway_id: 'GW-XYZ' }))
    expect(result.authorizationCode).toBe('GW-XYZ')
  })

  it('generates fallback id from orderId when id is null', () => {
    const result = transformTransaction(makePayment({ id: null }))
    expect(result.id).toBe('500-payment')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makePayment()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying TransactionSchema', () => {
    const result = transformTransaction(makePayment())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
