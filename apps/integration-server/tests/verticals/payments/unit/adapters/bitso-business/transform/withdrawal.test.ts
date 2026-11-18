import { describe, it, expect } from 'vitest'
import {
  transformWithdrawal,
  type RawBitsoWithdrawal,
} from '../../../../../../../src/verticals/payments/adapters/bitso-business/transform/withdrawal'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('bitso-business transformWithdrawal', () => {
  it('maps a "complete" withdrawal to status "paid" with correct amount', () => {
    const raw: RawBitsoWithdrawal = {
      wid: 'withdrawal-001',
      status: 'complete',
      currency: 'mxn',
      amount: '1500.00',
      method: 'sp',
      method_name: 'SPEI',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformWithdrawal(raw)
    expect(result.id).toBe('withdrawal-001')
    expect(result.externalId).toBe('withdrawal-001')
    expect(result.status).toBe('paid')
    // 1500.00 MXN at 2 decimals → 150000
    expect(result.amount).toBe(150000)
    expect(result.currency).toBe('MXN')
    expect(result.gateway).toBe('bitso-business')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a "pending" withdrawal to status "pending"', () => {
    const raw: RawBitsoWithdrawal = {
      wid: 'withdrawal-002',
      status: 'pending',
      currency: 'usd',
      amount: '100.00',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformWithdrawal(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('USD')
    expect(result.amount).toBe(10000)
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps an "in_progress" withdrawal to status "in_transit"', () => {
    const raw: RawBitsoWithdrawal = {
      wid: 'withdrawal-003',
      status: 'in_progress',
      currency: 'mxn',
      amount: '250.00',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformWithdrawal(raw)
    expect(result.status).toBe('in_transit')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a "failed" withdrawal to status "failed"', () => {
    const raw: RawBitsoWithdrawal = {
      wid: 'withdrawal-004',
      status: 'failed',
      currency: 'mxn',
      amount: '300.00',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformWithdrawal(raw)
    expect(result.status).toBe('failed')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps a "cancelled" withdrawal to status "cancelled"', () => {
    const raw: RawBitsoWithdrawal = {
      wid: 'withdrawal-005',
      status: 'cancelled',
      currency: 'mxn',
      amount: '75.00',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformWithdrawal(raw)
    expect(result.status).toBe('cancelled')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('sets statementDescriptor from method_name and carries metadata', () => {
    const raw: RawBitsoWithdrawal = {
      wid: 'withdrawal-006',
      status: 'complete',
      currency: 'mxn',
      amount: '50.00',
      method: 'sp',
      method_name: 'SPEI',
      network: 'SPEI_NETWORK',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformWithdrawal(raw)
    expect(result.statementDescriptor).toBe('SPEI')
    expect(result.metadata['method']).toBe('sp')
    expect(result.metadata['network']).toBe('SPEI_NETWORK')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
