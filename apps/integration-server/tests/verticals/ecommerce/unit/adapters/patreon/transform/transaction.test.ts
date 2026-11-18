import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawPatreonChargeEvent,
} from '../../../../../../../src/verticals/ecommerce/adapters/patreon/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeChargeEvent(
  overrides: Partial<RawPatreonChargeEvent> = {},
): RawPatreonChargeEvent {
  return {
    id: 'mem-001',
    last_charge_date: '2024-03-01T00:00:00.000+00:00',
    last_charge_status: 'Paid',
    currently_entitled_amount_cents: 1000,
    lifetime_support_cents: 12000,
    patron_status: 'active_patron',
    email: 'patron@example.com',
    _type: 'member',
    _relationships: {
      campaign: { data: { type: 'campaign', id: 'camp-001' } },
    },
    ...overrides,
  }
}

describe('transformTransaction (Patreon Charge Event)', () => {
  it('maps a successful charge to SALE/SUCCESS', () => {
    const result = transformTransaction(makeChargeEvent())
    expect(result.id).toBe('txn-mem-001')
    expect(result.orderId).toBe('mem-001')
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('SUCCESS')
    expect(result.gateway).toBe('patreon')
  })

  it('converts amount from cents to dollars', () => {
    const result = transformTransaction(makeChargeEvent())
    expect(result.amount).toEqual({ amount: 10, currency: 'USD' })
  })

  it('maps declined charge to SALE/FAILURE', () => {
    const result = transformTransaction(
      makeChargeEvent({ last_charge_status: 'Declined' }),
    )
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('FAILURE')
  })

  it('maps refunded charge to REFUND/SUCCESS', () => {
    const result = transformTransaction(
      makeChargeEvent({ last_charge_status: 'Refunded' }),
    )
    expect(result.kind).toBe('REFUND')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps pending charge to SALE/PENDING', () => {
    const result = transformTransaction(
      makeChargeEvent({ last_charge_status: 'Pending' }),
    )
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('PENDING')
  })

  it('maps fraud charge to SALE/FAILURE', () => {
    const result = transformTransaction(
      makeChargeEvent({ last_charge_status: 'Fraud' }),
    )
    expect(result.status).toBe('FAILURE')
  })

  it('includes campaign and lifetime metadata', () => {
    const result = transformTransaction(makeChargeEvent())
    expect(result.metadata['campaignId']).toBe('camp-001')
    expect(result.metadata['lifetimeSupportCents']).toBe(12000)
    expect(result.metadata['patronStatus']).toBe('active_patron')
  })

  it('uses last_charge_date as processedAt and createdAt', () => {
    const result = transformTransaction(makeChargeEvent())
    expect(result.processedAt).toBe('2024-03-01T00:00:00.000+00:00')
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000+00:00')
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    const result = transformTransaction(makeChargeEvent())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
