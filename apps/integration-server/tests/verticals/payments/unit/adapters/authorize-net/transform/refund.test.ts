import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawAuthNetRefund,
} from '../../../../../../../src/verticals/payments/adapters/authorize-net/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('authorize-net transformRefund', () => {
  const base: RawAuthNetRefund = {
    transId: 'refund-txn-99',
    refTransId: 'txn-12345',
    authAmount: '49.50',
    responseCode: '1',
    submitTimeUTC: '2024-03-16T08:00:00Z',
  }

  it('maps transId to id and refTransId to chargeId', () => {
    const result = transformRefund(base)
    expect(result.id).toBe('refund-txn-99')
    expect(result.chargeId).toBe('txn-12345')
  })

  it('converts authAmount to minor units', () => {
    const result = transformRefund(base)
    expect(result.amount).toBe(4950) // 49.50 * 100
  })

  it('maps responseCode 1 to succeeded status', () => {
    const result = transformRefund(base)
    expect(result.status).toBe('succeeded')
  })

  it('maps non-1 responseCode to pending status', () => {
    const result = transformRefund({ ...base, responseCode: '2' })
    expect(result.status).toBe('pending')
  })

  it('hardcodes currency to USD', () => {
    const result = transformRefund(base)
    expect(result.currency).toBe('USD')
  })

  it('puts responseCode in metadata', () => {
    const result = transformRefund(base)
    expect(result.metadata['responseCode']).toBe('1')
  })

  it('sets gateway to authorize-net', () => {
    const result = transformRefund(base)
    expect(result.gateway).toBe('authorize-net')
  })

  it('conforms to RefundSchema', () => {
    expect(() => RefundSchema.parse(transformRefund(base))).not.toThrow()
  })
})
