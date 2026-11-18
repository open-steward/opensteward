import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawSaltEdgeTransaction,
} from '../../../../../../../src/verticals/payments/adapters/salt-edge/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('salt-edge transformCharge', () => {
  it('maps a posted transaction to succeeded status', () => {
    const raw: RawSaltEdgeTransaction = {
      id: 'txn-001',
      account_id: 'acc-001',
      status: 'posted',
      made_on: '2024-03-01',
      amount: -49.99,
      currency_code: 'USD',
      description: 'Supermarket purchase',
      category: 'groceries',
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('txn-001')
    expect(result.status).toBe('succeeded')
    expect(result.currency).toBe('USD')
    expect(result.customerId).toBe('acc-001')
    expect(result.description).toBe('Supermarket purchase')
    expect(result.gateway).toBe('salt-edge')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a pending transaction to pending status', () => {
    const raw: RawSaltEdgeTransaction = {
      id: 'txn-002',
      account_id: 'acc-002',
      status: 'pending',
      made_on: '2024-03-01',
      amount: -20,
      currency_code: 'EUR',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('handles negative amounts (debits) correctly', () => {
    const raw: RawSaltEdgeTransaction = {
      id: 'txn-003',
      account_id: 'acc-003',
      status: 'posted',
      amount: -10.5,
      currency_code: 'GBP',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    // toMinorUnits rounds -10.5 * 100 = -1050
    expect(result.amount).toBe(-1050)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('defaults to pending for unknown status', () => {
    const raw: RawSaltEdgeTransaction = {
      id: 'txn-004',
      account_id: 'acc-004',
      status: 'unknown',
      amount: -5,
      currency_code: 'EUR',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
