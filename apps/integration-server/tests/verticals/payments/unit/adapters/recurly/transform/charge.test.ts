import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawRecurlyTransaction,
} from '../../../../../../../src/verticals/payments/adapters/recurly/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('recurly transformCharge', () => {
  it('maps a successful payment transaction to succeeded status', () => {
    const raw: RawRecurlyTransaction = {
      id: 'txn-001',
      uuid: 'uuid-001',
      type: 'purchase',
      status: 'success',
      amount: 49.99,
      currency: 'USD',
      account: { id: 'acc-001' },
      invoice: { id: 'inv-001' },
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('txn-001')
    expect(result.externalId).toBe('uuid-001')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.customerId).toBe('acc-001')
    expect(result.invoiceId).toBe('inv-001')
    expect(result.gateway).toBe('recurly')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a refund type with success status to refunded', () => {
    const raw: RawRecurlyTransaction = {
      id: 'txn-002',
      uuid: 'uuid-002',
      type: 'refund',
      status: 'success',
      amount: 20,
      currency: 'EUR',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a declined transaction to failed status', () => {
    const raw: RawRecurlyTransaction = {
      id: 'txn-003',
      uuid: 'uuid-003',
      type: 'purchase',
      status: 'declined',
      amount: 30,
      currency: 'GBP',
      error: { code: 'insufficient_funds', message: 'Insufficient funds' },
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('insufficient_funds')
    expect(result.failureMessage).toBe('Insufficient funds')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a voided transaction to cancelled status', () => {
    const raw: RawRecurlyTransaction = {
      id: 'txn-004',
      uuid: 'uuid-004',
      type: 'purchase',
      status: 'voided',
      amount: 15,
      currency: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a pending transaction to pending status', () => {
    const raw: RawRecurlyTransaction = {
      id: 'txn-005',
      uuid: 'uuid-005',
      type: 'purchase',
      status: 'pending',
      amount: 100,
      currency: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
