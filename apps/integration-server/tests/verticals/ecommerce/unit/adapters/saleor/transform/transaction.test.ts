import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  untransformTransaction,
  type RawSaleorTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/saleor/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

// Shape per docs.saleor.io/api-reference/payments/objects/transaction-item:
// TransactionItem has no status/type; each TransactionEvent has type, amount
// (Money!) and createdAt.
function makeTransaction(overrides: Partial<RawSaleorTransaction> = {}): RawSaleorTransaction {
  return {
    id: 'VHJhbnNhY3Rpb25JdGVtOjE=',
    pspReference: 'pi_12345',
    events: [
      {
        type: 'CHARGE_REQUEST',
        amount: { amount: 108.24, currency: 'USD' },
        createdAt: '2024-05-01T10:00:00Z',
      },
      {
        type: 'CHARGE_SUCCESS',
        amount: { amount: 108.24, currency: 'USD' },
        createdAt: '2024-05-01T10:00:05Z',
      },
    ],
    order: { id: 'ORD1' },
    createdAt: '2024-05-01T10:00:00Z',
    ...overrides,
  }
}

describe('transformTransaction (Saleor)', () => {
  it('maps core fields from the latest event', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('VHJhbnNhY3Rpb25JdGVtOjE=')
    expect(result.orderId).toBe('ORD1')
    expect(result.kind).toBe('CAPTURE')
    expect(result.status).toBe('SUCCESS')
    expect(result.amount).toEqual({ amount: 10824, currency: 'USD' })
    expect(result.createdAt).toBe('2024-05-01T10:00:00Z')
    // pspReference is a PSP reference, not a gateway slug
    expect(result.gateway).toBeUndefined()
  })

  it('orders events by createdAt, not by list position', () => {
    const result = transformTransaction(
      makeTransaction({
        events: [
          {
            type: 'REFUND_SUCCESS',
            amount: { amount: 25, currency: 'EUR' },
            createdAt: '2024-05-02T00:00:00Z',
          },
          {
            type: 'CHARGE_SUCCESS',
            amount: { amount: 50, currency: 'EUR' },
            createdAt: '2024-05-01T00:00:00Z',
          },
        ],
      }),
    )
    expect(result.kind).toBe('REFUND')
    expect(result.amount).toEqual({ amount: 2500, currency: 'EUR' })
  })

  it('maps AUTHORIZATION_SUCCESS to AUTHORIZATION kind', () => {
    const result = transformTransaction(
      makeTransaction({
        events: [
          {
            type: 'AUTHORIZATION_SUCCESS',
            amount: { amount: 50, currency: 'EUR' },
            createdAt: '2024-05-01T10:00:00Z',
          },
        ],
      }),
    )
    expect(result.kind).toBe('AUTHORIZATION')
    expect(result.status).toBe('SUCCESS')
  })

  it('skips events that name no payment action', () => {
    const result = transformTransaction(
      makeTransaction({
        events: [
          {
            type: 'CHARGE_FAILURE',
            amount: { amount: 5, currency: 'EUR' },
            createdAt: '2024-05-01T10:00:00Z',
          },
          {
            type: 'INFO',
            amount: { amount: 0, currency: 'EUR' },
            createdAt: '2024-05-01T11:00:00Z',
          },
        ],
      }),
    )
    expect(result).toMatchObject({ kind: 'CAPTURE', status: 'FAILURE' })
  })

  it('leaves kind, status and amount unset with no events', () => {
    const result = transformTransaction(makeTransaction({ events: [] }))
    expect(result.kind).toBeUndefined()
    expect(result.status).toBeUndefined()
    expect(result.amount).toBeUndefined()
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeTransaction()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })

  it.each([
    ['AUTHORIZATION_SUCCESS', 'AUTHORIZATION', 'SUCCESS'],
    ['AUTHORIZATION_FAILURE', 'AUTHORIZATION', 'FAILURE'],
    ['AUTHORIZATION_REQUEST', 'AUTHORIZATION', 'PENDING'],
    ['CHARGE_SUCCESS', 'CAPTURE', 'SUCCESS'],
    ['CHARGE_FAILURE', 'CAPTURE', 'FAILURE'],
    ['CHARGE_REQUEST', 'CAPTURE', 'PENDING'],
    ['REFUND_SUCCESS', 'REFUND', 'SUCCESS'],
    ['REFUND_FAILURE', 'REFUND', 'FAILURE'],
    ['REFUND_REQUEST', 'REFUND', 'PENDING'],
    ['CANCEL_SUCCESS', 'VOID', 'SUCCESS'],
    ['CANCEL_FAILURE', 'VOID', 'FAILURE'],
    ['CANCEL_REQUEST', 'VOID', 'PENDING'],
  ])('maps event %s to %s / %s', (type, kind, status) => {
    const result = transformTransaction(
      makeTransaction({
        events: [
          { type, amount: { amount: 5, currency: 'EUR' }, createdAt: '2024-05-01T10:00:00Z' },
        ],
      }),
    )
    expect([result.kind, result.status]).toEqual([kind, status])
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })

  it('untransformTransaction scales by the currency, not by 100', () => {
    const raw = untransformTransaction({ amount: { amount: 1500, currency: 'JPY' } })
    expect(raw['amount']).toBe(1500)
    expect(raw['currency']).toBe('JPY')
  })

  it('untransformTransaction carries the amount back', () => {
    const raw = untransformTransaction(transformTransaction(makeTransaction()))
    expect(raw['amount']).toBe(108.24)
    expect(raw['currency']).toBe('USD')
  })
})
