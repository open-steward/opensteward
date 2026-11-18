import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawMPRefund,
} from '../../../../../../../src/verticals/payments/adapters/mercado-pago/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/payments/schema/refund'

describe('mercado-pago transformRefund', () => {
  const base: RawMPRefund = {
    id: 111222333,
    payment_id: 987654321,
    amount: 75.5,
    source: { name: 'Support Agent', type: 'operator', id: 'agent-7' },
    status: 'approved',
    date_created: '2024-03-02T08:30:00.000Z',
  }

  it('maps id and chargeId from payment_id', () => {
    const result = transformRefund(base)
    expect(result.id).toBe('111222333')
    expect(result.chargeId).toBe('987654321')
  })

  it('converts amount to minor units', () => {
    const result = transformRefund(base)
    expect(result.amount).toBe(7550) // 75.50 * 100
  })

  it('maps approved status to succeeded', () => {
    const result = transformRefund(base)
    expect(result.status).toBe('succeeded')
  })

  it('maps non-approved status to pending', () => {
    const result = transformRefund({ ...base, status: 'pending' })
    expect(result.status).toBe('pending')
  })

  it('puts source details in metadata', () => {
    const result = transformRefund(base)
    expect(result.metadata['source_name']).toBe('Support Agent')
    expect(result.metadata['source_id']).toBe('agent-7')
  })

  it('sets gateway to mercado-pago', () => {
    const result = transformRefund(base)
    expect(result.gateway).toBe('mercado-pago')
  })

  it('defaults currency to ARS (no currency field on refund)', () => {
    const result = transformRefund(base)
    expect(result.currency).toBe('ARS')
  })

  it('conforms to RefundSchema', () => {
    expect(() => RefundSchema.parse(transformRefund(base))).not.toThrow()
  })
})
