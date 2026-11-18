import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  untransformCapture,
  type RawCLTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/commercelayer/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeTransaction(overrides: Partial<RawCLTransaction> = {}): RawCLTransaction {
  return {
    id: 'txn-001',
    _type: 'captures',
    currency_code: 'USD',
    amount_cents: 5950,
    succeeded: true,
    gateway_transaction_id: 'gw-ch-abc123',
    token: 'auth-code-xyz',
    message: 'Transaction approved',
    created_at: '2024-07-01T10:10:00.000Z',
    updated_at: '2024-07-01T10:10:00.000Z',
    _relationships: {
      order: { data: { type: 'orders', id: 'order-001' } },
    },
    ...overrides,
  }
}

describe('transformTransaction (Commerce Layer)', () => {
  it('maps core fields for a capture', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('txn-001')
    expect(result.orderId).toBe('order-001')
    expect(result.kind).toBe('CAPTURE')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps money from cents', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.amount).toEqual({ amount: 5950, currency: 'USD' })
  })

  it('maps authorization type', () => {
    const result = transformTransaction(makeTransaction({ _type: 'authorizations' }))
    expect(result.kind).toBe('AUTHORIZATION')
  })

  it('maps refund type', () => {
    const result = transformTransaction(makeTransaction({ _type: 'refunds' }))
    expect(result.kind).toBe('REFUND')
  })

  it('maps void type', () => {
    const result = transformTransaction(makeTransaction({ _type: 'voids' }))
    expect(result.kind).toBe('VOID')
  })

  it('maps failed transaction', () => {
    const result = transformTransaction(makeTransaction({
      succeeded: false,
      error_code: 'card_declined',
      error_detail: 'Insufficient funds',
    }))
    expect(result.status).toBe('FAILURE')
    expect(result.errorCode).toBe('card_declined')
    expect(result.errorMessage).toBe('Insufficient funds')
  })

  it('maps pending transaction (succeeded=undefined)', () => {
    const result = transformTransaction(makeTransaction({ succeeded: undefined }))
    expect(result.status).toBe('PENDING')
  })

  it('maps gateway and auth code', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.gateway).toBe('gw-ch-abc123')
    expect(result.authorizationCode).toBe('auth-code-xyz')
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
})

describe('untransformCapture (Commerce Layer)', () => {
  it('produces JSON:API body with order relationship', () => {
    const body = untransformCapture({
      orderId: 'order-002',
    }) as { data: { type: string; relationships: Record<string, unknown> } }
    expect(body.data.type).toBe('captures')
    expect(body.data.relationships['order']).toEqual({
      data: { type: 'orders', id: 'order-002' },
    })
  })
})
