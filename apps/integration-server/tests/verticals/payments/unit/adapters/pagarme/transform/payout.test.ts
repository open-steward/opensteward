import { describe, it, expect } from 'vitest'
import {
  transformPayout,
  type RawPagarmePayable,
} from '../../../../../../../src/verticals/payments/adapters/pagarme/transform/payout'
import { PayoutSchema } from '../../../../../../../src/verticals/payments/schema/payout'

describe('pagarme transformPayout', () => {
  it('maps transferred payable to paid payout', () => {
    const raw: RawPagarmePayable = {
      id: 'pay_001',
      status: 'transferred',
      amount: 50000,
      fee: 500,
      charge_id: 'ch_abc',
      recipient_id: 'rec_xyz',
      payment_date: '2024-03-15T00:00:00Z',
      created_at: '2024-03-01T00:00:00Z',
      type: 'credit',
      payment_method: 'credit_card',
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('pay_001')
    expect(result.externalId).toBe('pay_001')
    expect(result.amount).toBe(50000)
    expect(result.currency).toBe('BRL')
    expect(result.status).toBe('paid')
    expect(result.method).toBe('standard')
    expect(result.gateway).toBe('pagarme')
    expect(result.metadata['charge_id']).toBe('ch_abc')
    expect(result.metadata['recipient_id']).toBe('rec_xyz')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps waiting_funds status to pending', () => {
    const raw: RawPagarmePayable = {
      id: 'pay_wait',
      status: 'waiting_funds',
      amount: 20000,
      payment_date: '2024-04-01T00:00:00Z',
      created_at: '2024-03-20T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('pending')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps prepaid status to in_transit', () => {
    const raw: RawPagarmePayable = {
      id: 'pay_prep',
      status: 'prepaid',
      amount: 30000,
      created_at: '2024-03-10T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.status).toBe('in_transit')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })

  it('maps suspended and canceled to cancelled', () => {
    const suspended: RawPagarmePayable = {
      id: 'pay_sus',
      status: 'suspended',
      amount: 1000,
      created_at: '2024-03-01T00:00:00Z',
    }
    const canceled: RawPagarmePayable = {
      id: 'pay_can',
      status: 'canceled',
      amount: 1000,
      created_at: '2024-03-01T00:00:00Z',
    }
    expect(transformPayout(suspended).status).toBe('cancelled')
    expect(transformPayout(canceled).status).toBe('cancelled')
    expect(() => PayoutSchema.parse(transformPayout(suspended))).not.toThrow()
    expect(() => PayoutSchema.parse(transformPayout(canceled))).not.toThrow()
  })

  it('handles numeric id (number type)', () => {
    const raw: RawPagarmePayable = {
      id: 12345,
      status: 'transferred',
      amount: 10000,
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformPayout(raw)
    expect(result.id).toBe('12345')
    expect(() => PayoutSchema.parse(result)).not.toThrow()
  })
})
