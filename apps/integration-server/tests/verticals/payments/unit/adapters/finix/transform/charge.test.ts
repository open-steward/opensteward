import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  type RawFinixTransfer,
} from '../../../../../../../src/verticals/payments/adapters/finix/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('finix transformCharge', () => {
  it('maps a SUCCEEDED transfer to status "succeeded"', () => {
    const raw: RawFinixTransfer = {
      id: 'TRf1',
      type: 'DEBIT',
      state: 'SUCCEEDED',
      amount: 5000,
      currency: 'USD',
      source: 'PIi1',
      merchant_identity: 'IDi1',
      statement_descriptor: 'ACME Store',
      trace_id: 'trace-abc',
      created_at: '2024-03-01T00:00:00.000Z',
      updated_at: '2024-03-01T00:00:00.000Z',
    }
    const result = transformCharge(raw)
    expect(result.id).toBe('TRf1')
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.captured).toBe(true)
    expect(result.customerId).toBe('IDi1')
    expect(result.paymentMethodId).toBe('PIi1')
    expect(result.statementDescriptor).toBe('ACME Store')
    expect(result.gateway).toBe('finix')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING transfer to status "pending"', () => {
    const raw: RawFinixTransfer = {
      id: 'TRf2',
      state: 'PENDING',
      amount: 2000,
      currency: 'USD',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.captured).toBe(false)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a FAILED transfer to status "failed" with failure details', () => {
    const raw: RawFinixTransfer = {
      id: 'TRf3',
      state: 'FAILED',
      amount: 1500,
      currency: 'USD',
      failure_code: 'INSUFFICIENT_FUNDS',
      failure_message: 'Card declined due to insufficient funds',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureCode).toBe('INSUFFICIENT_FUNDS')
    expect(result.failureMessage).toBe('Card declined due to insufficient funds')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELED transfer to status "cancelled"', () => {
    const raw: RawFinixTransfer = {
      id: 'TRf4',
      state: 'CANCELED',
      amount: 800,
      currency: 'EUR',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('merges tags into metadata', () => {
    const raw: RawFinixTransfer = {
      id: 'TRf5',
      state: 'SUCCEEDED',
      amount: 3000,
      currency: 'USD',
      tags: { order_id: 'ORD-99', source: 'web' },
    }
    const result = transformCharge(raw)
    expect(result.metadata['order_id']).toBe('ORD-99')
    expect(result.metadata['source']).toBe('web')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to USD when absent', () => {
    const raw: RawFinixTransfer = {
      id: 'TRf6',
      state: 'PENDING',
      amount: 100,
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('USD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
