import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawVtexPayment,
  type RawVtexTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/vtex/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makePayment(overrides: Partial<RawVtexPayment> = {}): RawVtexPayment {
  return {
    id: 'PAY-001',
    paymentSystemName: 'Visa',
    paymentSystem: 1,
    value: 10990,
    status: 'APPROVED',
    authId: 'AUTH-XYZ',
    lastChangeDate: '2024-05-01T10:30:00.000Z',
    ...overrides,
  }
}

function makeTxn(overrides: Partial<RawVtexTransaction> = {}): RawVtexTransaction {
  return {
    transactionId: 'TXN-001',
    merchantName: 'Acme Store',
    payments: [],
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('composes id as {orderId}:{transactionId}:{paymentId}', () => {
    const result = transformTransaction(makePayment(), makeTxn(), 'ORD-1001-01')
    expect(result.id).toBe('ORD-1001-01:TXN-001:PAY-001')
  })

  it('handles missing paymentId or transactionId gracefully', () => {
    const result = transformTransaction(
      makePayment({ id: undefined }),
      makeTxn({ transactionId: undefined }),
      'ORD-1001-01',
    )
    expect(result.id).toBe('ORD-1001-01')
  })

  it('hardcodes currency to BRL', () => {
    const result = transformTransaction(makePayment(), makeTxn(), 'ORD-1001-01')
    expect(result.amount?.currency).toBe('BRL')
  })

  it('passes value through as integer minor units (centavos)', () => {
    const result = transformTransaction(makePayment(), makeTxn(), 'ORD-1001-01')
    expect(result.amount).toEqual({ amount: 10990, currency: 'BRL' })
  })

  it('maps orderId', () => {
    const result = transformTransaction(makePayment(), makeTxn(), 'ORD-1001-01')
    expect(result.orderId).toBe('ORD-1001-01')
  })

  it('maps APPROVED status to SUCCESS', () => {
    const result = transformTransaction(
      makePayment({ status: 'APPROVED' }),
      makeTxn(),
      'ORD-1001-01',
    )
    expect(result.status).toBe('SUCCESS')
  })

  it('maps DENIED status to FAILURE', () => {
    const result = transformTransaction(makePayment({ status: 'DENIED' }), makeTxn(), 'ORD-1001-01')
    expect(result.status).toBe('FAILURE')
  })

  it('maps PENDING status to PENDING', () => {
    const result = transformTransaction(
      makePayment({ status: 'PENDING' }),
      makeTxn(),
      'ORD-1001-01',
    )
    expect(result.status).toBe('PENDING')
  })

  it('maps kind to AUTHORIZATION when authId is present', () => {
    const result = transformTransaction(
      makePayment({ authId: 'AUTH-XYZ' }),
      makeTxn(),
      'ORD-1001-01',
    )
    expect(result.kind).toBe('AUTHORIZATION')
  })

  it('maps kind to SALE when no authId and status is not APPROVED', () => {
    const result = transformTransaction(
      makePayment({ authId: undefined, status: 'PENDING' }),
      makeTxn(),
      'ORD-1001-01',
    )
    expect(result.kind).toBe('SALE')
  })

  it('maps gateway from paymentSystemName', () => {
    const result = transformTransaction(makePayment(), makeTxn(), 'ORD-1001-01')
    expect(result.gateway).toBe('Visa')
  })

  it('maps authorizationCode from authId', () => {
    const result = transformTransaction(makePayment(), makeTxn(), 'ORD-1001-01')
    expect(result.authorizationCode).toBe('AUTH-XYZ')
  })

  it('falls back authorizationCode to tid when authId is absent', () => {
    const result = transformTransaction(
      makePayment({ authId: undefined, tid: 'TID-123' }),
      makeTxn(),
      'ORD-1001-01',
    )
    expect(result.authorizationCode).toBe('TID-123')
  })

  it('omits amount when value is null', () => {
    const result = transformTransaction(makePayment({ value: null }), makeTxn(), 'ORD-1001-01')
    expect(result.amount).toBeUndefined()
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    const result = transformTransaction(makePayment(), makeTxn(), 'ORD-1001-01')
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
