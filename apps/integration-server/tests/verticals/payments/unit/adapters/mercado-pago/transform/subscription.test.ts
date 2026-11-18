import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawMPPreapproval,
} from '../../../../../../../src/verticals/payments/adapters/mercado-pago/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('mercado-pago transformSubscription', () => {
  const base: RawMPPreapproval = {
    id: 'preapproval-abc-123',
    payer_id: 'payer-999',
    payer_email: 'subscriber@example.com',
    status: 'authorized',
    reason: 'Monthly plan',
    preapproval_plan_id: 'plan-xyz',
    auto_recurring: {
      transaction_amount: 29.99,
      currency_id: 'BRL',
      frequency: 1,
      frequency_type: 'months',
      start_date: '2024-01-01T00:00:00.000Z',
      end_date: '2025-01-01T00:00:00.000Z',
    },
    next_payment_date: '2024-02-01T00:00:00.000Z',
    date_created: '2024-01-01T00:00:00.000Z',
    last_modified: '2024-01-15T00:00:00.000Z',
  }

  it('maps id and externalId', () => {
    const result = transformSubscription(base)
    expect(result.id).toBe('preapproval-abc-123')
    expect(result.externalId).toBe('preapproval-abc-123')
  })

  it('maps payer_id to customerId', () => {
    const result = transformSubscription(base)
    expect(result.customerId).toBe('payer-999')
  })

  it('maps authorized status to active', () => {
    const result = transformSubscription(base)
    expect(result.status).toBe('active')
  })

  it('maps currency from auto_recurring', () => {
    const result = transformSubscription(base)
    expect(result.currency).toBe('BRL')
  })

  it('creates items array from preapproval_plan_id with amount in minor units', () => {
    const result = transformSubscription(base)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.id).toBe('plan-xyz')
    expect(result.items[0]!.amount).toBe(2999) // 29.99 * 100
  })

  it('maps next_payment_date to currentPeriodEnd', () => {
    const result = transformSubscription(base)
    expect(result.currentPeriodEnd).toBe('2024-02-01T00:00:00.000Z')
  })

  it('maps paused status', () => {
    const result = transformSubscription({ ...base, status: 'paused' })
    expect(result.status).toBe('paused')
  })

  it('maps cancelled status', () => {
    const result = transformSubscription({ ...base, status: 'cancelled' })
    expect(result.status).toBe('cancelled')
  })

  it('maps finished status to expired', () => {
    const result = transformSubscription({ ...base, status: 'finished' })
    expect(result.status).toBe('expired')
  })

  it('sets gateway to mercado-pago', () => {
    const result = transformSubscription(base)
    expect(result.gateway).toBe('mercado-pago')
  })

  it('conforms to SubscriptionSchema', () => {
    expect(() => SubscriptionSchema.parse(transformSubscription(base))).not.toThrow()
  })
})
