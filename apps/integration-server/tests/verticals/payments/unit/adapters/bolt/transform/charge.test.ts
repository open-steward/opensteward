import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawBoltTransaction,
} from '../../../../../../../src/verticals/payments/adapters/bolt/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('bolt transformCharge', () => {
  it('maps a completed transaction to status "succeeded"', () => {
    const raw: RawBoltTransaction = {
      id: 'txn-001',
      transaction_reference: 'LBLJ-TWW7-R9VC',
      status: 'completed',
      amount: { amount: 4999, currency: 'USD' },
      account_id: 'acct-123',
      shopper: { email: 'buyer@example.com' },
      date_created: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.customerId).toBe('acct-123')
    expect(result.gateway).toBe('bolt')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an in_progress transaction to status "pending"', () => {
    const raw: RawBoltTransaction = {
      transaction_reference: 'ABCD-1234',
      status: 'in_progress',
      amount: 1000,
      currency: 'EUR',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a cancelled transaction to status "cancelled"', () => {
    const raw: RawBoltTransaction = {
      transaction_reference: 'CANC-0001',
      status: 'cancelled',
      amount: 500,
      currency: 'GBP',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a rejected transaction to status "failed"', () => {
    const raw: RawBoltTransaction = {
      transaction_reference: 'FAIL-0001',
      status: 'rejected',
      amount: 250,
      currency: 'USD',
      failure_reason: 'Insufficient funds',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureMessage).toBe('Insufficient funds')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('uses transaction_reference as id over reference and id fields', () => {
    const raw: RawBoltTransaction = {
      id: 'raw-id',
      reference: 'ref-id',
      transaction_reference: 'txn-ref',
      status: 'completed',
      amount: 100,
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('txn-ref')
    expect(result.externalId).toBe('txn-ref')
  })

  it('defaults currency to USD when none supplied', () => {
    const raw: RawBoltTransaction = {
      transaction_reference: 'NO-CURR',
      status: 'completed',
      amount: 100,
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('USD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
