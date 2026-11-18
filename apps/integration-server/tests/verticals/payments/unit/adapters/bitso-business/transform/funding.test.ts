import { describe, it, expect } from 'vitest'
import {
  transformFunding,
  type RawBitsoFunding,
} from '../../../../../../../src/verticals/payments/adapters/bitso-business/transform/funding'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

describe('bitso-business transformFunding', () => {
  it('maps a "complete" funding to status "succeeded" with correct amount', () => {
    const raw: RawBitsoFunding = {
      fid: 'funding-001',
      status: 'complete',
      currency: 'mxn',
      amount: '500.00',
      method: 'sp',
      method_name: 'SPEI',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformFunding(raw)
    expect(result.id).toBe('funding-001')
    expect(result.externalId).toBe('funding-001')
    expect(result.status).toBe('succeeded')
    // 500.00 MXN at 2 decimals → 50000
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('MXN')
    expect(result.gateway).toBe('bitso-business')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a "pending" funding to status "pending"', () => {
    const raw: RawBitsoFunding = {
      fid: 'funding-002',
      status: 'pending',
      currency: 'usd',
      amount: '100.00',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformFunding(raw)
    expect(result.status).toBe('pending')
    expect(result.currency).toBe('USD')
    expect(result.amount).toBe(10000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps a "failed" funding to status "failed"', () => {
    const raw: RawBitsoFunding = {
      fid: 'funding-003',
      status: 'failed',
      currency: 'mxn',
      amount: '200.00',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformFunding(raw)
    expect(result.status).toBe('failed')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('carries method and method_name into metadata', () => {
    const raw: RawBitsoFunding = {
      fid: 'funding-004',
      status: 'complete',
      currency: 'mxn',
      amount: '75.50',
      method: 'sp',
      method_name: 'SPEI',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformFunding(raw)
    expect(result.metadata['method']).toBe('sp')
    expect(result.metadata['method_name']).toBe('SPEI')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('defaults currency to MXN when not provided', () => {
    const raw: RawBitsoFunding = {
      fid: 'funding-005',
      status: 'completed',
      amount: '50.00',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformFunding(raw)
    expect(result.currency).toBe('MXN')
    expect(result.amount).toBe(5000)
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
