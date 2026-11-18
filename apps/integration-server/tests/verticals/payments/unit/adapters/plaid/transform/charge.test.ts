import { describe, it, expect } from 'vitest'
import {
  transformCharge,
  mapChargeStatus,
  type RawPlaidTransfer,
} from '../../../../../../../src/verticals/payments/adapters/plaid/transform/charge'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('plaid transformCharge', () => {
  it('maps status "settled" to "succeeded" and converts decimal amount to minor units', () => {
    const raw: RawPlaidTransfer = {
      id: 'transfer_settled',
      account_id: 'acc_123',
      type: 'debit',
      amount: '12.34',
      iso_currency_code: 'USD',
      status: 'settled',
      network: 'ach',
      user: { email_address: 'buyer@example.com' },
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('succeeded')
    expect(result.amount).toBe(1234)
    expect(result.currency).toBe('USD')
    expect(result.id).toBe('transfer_settled')
    expect(result.receiptEmail).toBe('buyer@example.com')
    expect(result.captured).toBe(true)
    expect(result.gateway).toBe('plaid')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "pending" to "pending" with captured false', () => {
    const raw: RawPlaidTransfer = {
      id: 'transfer_pending',
      amount: '5.00',
      iso_currency_code: 'USD',
      status: 'pending',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('pending')
    expect(result.amount).toBe(500)
    expect(result.captured).toBe(false)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "failed" to "failed" with failure details', () => {
    const raw: RawPlaidTransfer = {
      id: 'transfer_failed',
      amount: '10.00',
      iso_currency_code: 'USD',
      status: 'failed',
      failure_reason: { description: 'Insufficient funds', ach_return_code: 'R01' },
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('failed')
    expect(result.failureMessage).toBe('Insufficient funds')
    expect(result.failureCode).toBe('R01')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "returned" to "refunded"', () => {
    const raw: RawPlaidTransfer = {
      id: 'transfer_returned',
      amount: '8.00',
      status: 'returned',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('refunded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "cancelled" to "cancelled"', () => {
    const raw: RawPlaidTransfer = {
      id: 'transfer_cancelled',
      amount: '3.00',
      status: 'cancelled',
    }
    const result = transformCharge(raw)
    expect(result.status).toBe('cancelled')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to USD when iso_currency_code is absent', () => {
    const raw: RawPlaidTransfer = {
      id: 'transfer_usd',
      amount: '1.00',
      status: 'settled',
    }
    const result = transformCharge(raw)
    expect(result.currency).toBe('USD')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status "funds_available" to "succeeded" via mapChargeStatus', () => {
    const raw: RawPlaidTransfer = { id: 'tr_fa', amount: '2.00', status: 'funds_available' }
    expect(mapChargeStatus(raw)).toBe('succeeded')
  })
})
