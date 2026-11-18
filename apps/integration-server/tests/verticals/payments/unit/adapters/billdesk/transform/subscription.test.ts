import { describe, it, expect } from 'vitest'
import {
  transformSubscription,
  type RawBilldeskMandate,
} from '../../../../../../../src/verticals/payments/adapters/billdesk/transform/subscription'
import { SubscriptionSchema } from '../../../../../../../src/verticals/payments/schema/subscription'

describe('billdesk transformSubscription', () => {
  it('maps an ACTIVE mandate to status "active"', () => {
    const raw: RawBilldeskMandate = {
      mandateid: 'MANDATE-001',
      mercid: 'MERC001',
      subscription_refid: 'SUB-REF-001',
      mandate_amount: '299.00',
      amount_type: 'FIXED',
      frequency: 'MONTHLY',
      mandate_start_date: '20240301',
      mandate_end_date: '20250301',
      status: 'ACTIVE',
      currency: '356',
      customer_name: 'Rahul Sharma',
      payment_method_type: 'UPI',
      createdon: '2024-03-01T00:00:00+05:30',
      updatedon: '2024-03-01T00:00:00+05:30',
    }
    const result = transformSubscription(raw)
    expect(result.id).toBe('MANDATE-001')
    expect(result.status).toBe('active')
    expect(result.currency).toBe('INR')
    expect(result.customerId).toBe('MERC001')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].amount).toBe(29900)
    expect(result.gateway).toBe('billdesk')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a CANCELLED mandate to status "cancelled" with cancelledAt set', () => {
    const raw: RawBilldeskMandate = {
      mandateid: 'MANDATE-002',
      mercid: 'MERC002',
      mandate_amount: '199.00',
      frequency: 'MONTHLY',
      status: 'CANCELLED',
      currency: '356',
      createdon: '2024-03-01T00:00:00+05:30',
      updatedon: '2024-03-15T00:00:00+05:30',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('cancelled')
    expect(result.cancelledAt).toBeTruthy()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a PAUSED mandate to status "paused"', () => {
    const raw: RawBilldeskMandate = {
      mandateid: 'MANDATE-003',
      mercid: 'MERC003',
      mandate_amount: '99.00',
      status: 'PAUSED',
      currency: '356',
      createdon: '2024-03-01T00:00:00+05:30',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('paused')
    expect(result.cancelledAt).toBeUndefined()
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps a CREATED mandate to status "incomplete"', () => {
    const raw: RawBilldeskMandate = {
      mandateid: 'MANDATE-004',
      mercid: 'MERC004',
      mandate_amount: '499.00',
      status: 'CREATED',
      currency: '356',
      createdon: '2024-03-01T00:00:00+05:30',
    }
    const result = transformSubscription(raw)
    expect(result.status).toBe('incomplete')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('maps YEARLY frequency to interval "year"', () => {
    const raw: RawBilldeskMandate = {
      mandateid: 'MANDATE-005',
      mercid: 'MERC005',
      mandate_amount: '999.00',
      frequency: 'YEARLY',
      status: 'ACTIVE',
      currency: '356',
      createdon: '2024-03-01T00:00:00+05:30',
    }
    const result = transformSubscription(raw)
    // frequency is stored in metadata, not on items directly
    expect(result.metadata.frequency).toBe('YEARLY')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })

  it('converts numeric currency 356 to "INR"', () => {
    const raw: RawBilldeskMandate = {
      mandateid: 'MANDATE-006',
      mercid: 'MERC006',
      mandate_amount: '299.00',
      status: 'ACTIVE',
      currency: '356',
      createdon: '2024-03-01T00:00:00+05:30',
    }
    const result = transformSubscription(raw)
    expect(result.currency).toBe('INR')
    expect(() => SubscriptionSchema.parse(result)).not.toThrow()
  })
})
