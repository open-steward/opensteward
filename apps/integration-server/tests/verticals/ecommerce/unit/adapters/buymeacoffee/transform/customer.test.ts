import { describe, it, expect } from 'vitest'
import {
  transformSupporterAsCustomer,
  transformSubscriptionAsCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/buymeacoffee/transform/customer'
import type { BmacSupporter, BmacSubscription } from '../../../../../../../src/verticals/ecommerce/adapters/buymeacoffee/transform/order'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSupporter(overrides: Partial<BmacSupporter> = {}): BmacSupporter {
  return {
    support_id: 12345,
    support_note: 'Keep it up!',
    support_coffees: 3,
    transaction_id: 'txn_abc',
    support_visibility: 1,
    support_created_on: '2024-01-15T10:30:00.000Z',
    support_updated_on: '2024-01-16T08:00:00.000Z',
    transfer_id: null,
    supporter_name: 'John D.',
    supporter_email: 'john@example.com',
    support_coffee_price: '5.00',
    support_email: 'john@example.com',
    support_currency: 'USD',
    referer: null,
    is_refunded: false,
    payer_email: 'john@example.com',
    payer_name: 'John Doe',
    ...overrides,
  }
}

function makeSubscription(overrides: Partial<BmacSubscription> = {}): BmacSubscription {
  return {
    subscription_id: 999,
    subscription_created_on: '2024-01-15T10:30:00.000Z',
    subscription_updated_on: '2024-01-15T10:30:00.000Z',
    subscription_cancelled_on: null,
    subscription_current_period_start: '2024-01-15T00:00:00.000Z',
    subscription_current_period_end: '2024-02-15T00:00:00.000Z',
    subscription_coffee_num: 1,
    subscription_coffee_price: '5.00',
    subscription_currency: 'USD',
    subscription_is_cancelled: false,
    subscription_is_cancelled_at_period_end: false,
    subscriber_email: 'jane@example.com',
    subscriber_name: 'Jane Smith',
    membership_level_id: 42,
    membership_level_name: 'Silver Member',
    ...overrides,
  }
}

// ── transformSupporterAsCustomer ──────────────────────────────────────────────

describe('transformSupporterAsCustomer (Buy Me a Coffee)', () => {
  it('uses payer_email as the canonical id', () => {
    const result = transformSupporterAsCustomer(makeSupporter())
    expect(result.id).toBe('john@example.com')
  })

  it('maps payer_email to canonical email', () => {
    const result = transformSupporterAsCustomer(makeSupporter())
    expect(result.email).toBe('john@example.com')
  })

  it('splits payer_name into firstName and lastName', () => {
    const result = transformSupporterAsCustomer(makeSupporter())
    expect(result.firstName).toBe('John')
    expect(result.lastName).toBe('Doe')
  })

  it('handles a single-word name (no lastName)', () => {
    const result = transformSupporterAsCustomer(
      makeSupporter({ payer_name: 'Mononym' }),
    )
    expect(result.firstName).toBe('Mononym')
    expect(result.lastName).toBeUndefined()
  })

  it('handles a multi-word name', () => {
    const result = transformSupporterAsCustomer(
      makeSupporter({ payer_name: 'Mary Jane Watson' }),
    )
    expect(result.firstName).toBe('Mary')
    expect(result.lastName).toBe('Jane Watson')
  })

  it('falls back to supporter_email when payer_email is absent', () => {
    const result = transformSupporterAsCustomer(
      makeSupporter({ payer_email: null, supporter_email: 'fallback@example.com' }),
    )
    expect(result.id).toBe('fallback@example.com')
    expect(result.email).toBe('fallback@example.com')
  })

  it('falls back to stringified support_id when all emails are absent', () => {
    const result = transformSupporterAsCustomer(
      makeSupporter({
        payer_email: null,
        supporter_email: null,
        support_email: null,
      }),
    )
    expect(result.id).toBe('12345')
    expect(result.email).toBeUndefined()
  })

  it('includes "supporter" in tags', () => {
    const result = transformSupporterAsCustomer(makeSupporter())
    expect(result.tags).toContain('supporter')
  })

  it('includes "refunded" tag when is_refunded is true', () => {
    const result = transformSupporterAsCustomer(
      makeSupporter({ is_refunded: true }),
    )
    expect(result.tags).toContain('refunded')
  })

  it('does not include "refunded" tag when is_refunded is false', () => {
    const result = transformSupporterAsCustomer(makeSupporter())
    expect(result.tags).not.toContain('refunded')
  })

  it('maps support_created_on to createdAt', () => {
    const result = transformSupporterAsCustomer(makeSupporter())
    expect(result.createdAt).toBe('2024-01-15T10:30:00.000Z')
  })

  it('maps support_updated_on to updatedAt', () => {
    const result = transformSupporterAsCustomer(makeSupporter())
    expect(result.updatedAt).toBe('2024-01-16T08:00:00.000Z')
  })

  it('preserves the raw object in metadata verbatim', () => {
    const raw = makeSupporter()
    const result = transformSupporterAsCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes CustomerSchema validation', () => {
    const result = transformSupporterAsCustomer(makeSupporter())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles missing payer_name gracefully', () => {
    const result = transformSupporterAsCustomer(
      makeSupporter({ payer_name: null, supporter_name: null }),
    )
    expect(result.firstName).toBeUndefined()
    expect(result.lastName).toBeUndefined()
  })
})

// ── transformSubscriptionAsCustomer ──────────────────────────────────────────

describe('transformSubscriptionAsCustomer (Buy Me a Coffee)', () => {
  it('uses subscriber_email as the canonical id', () => {
    const result = transformSubscriptionAsCustomer(makeSubscription())
    expect(result.id).toBe('jane@example.com')
  })

  it('maps subscriber_email to canonical email', () => {
    const result = transformSubscriptionAsCustomer(makeSubscription())
    expect(result.email).toBe('jane@example.com')
  })

  it('splits subscriber_name into firstName and lastName', () => {
    const result = transformSubscriptionAsCustomer(makeSubscription())
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Smith')
  })

  it('handles a single-word subscriber_name', () => {
    const result = transformSubscriptionAsCustomer(
      makeSubscription({ subscriber_name: 'Mononym' }),
    )
    expect(result.firstName).toBe('Mononym')
    expect(result.lastName).toBeUndefined()
  })

  it('falls back to stringified subscription_id when subscriber_email is absent', () => {
    const result = transformSubscriptionAsCustomer(
      makeSubscription({ subscriber_email: null }),
    )
    expect(result.id).toBe('999')
    expect(result.email).toBeUndefined()
  })

  it('includes "subscriber" in tags', () => {
    const result = transformSubscriptionAsCustomer(makeSubscription())
    expect(result.tags).toContain('subscriber')
  })

  it('includes tier tag from membership_level_name', () => {
    const result = transformSubscriptionAsCustomer(makeSubscription())
    expect(result.tags).toContain('tier:Silver Member')
  })

  it('omits tier tag when membership_level_name is absent', () => {
    const result = transformSubscriptionAsCustomer(
      makeSubscription({ membership_level_name: null }),
    )
    expect(result.tags?.some((t) => t.startsWith('tier:'))).toBe(false)
  })

  it('includes "cancelled" tag when subscription_is_cancelled is true', () => {
    const result = transformSubscriptionAsCustomer(
      makeSubscription({ subscription_is_cancelled: true }),
    )
    expect(result.tags).toContain('cancelled')
  })

  it('does not include "cancelled" tag for active subscriptions', () => {
    const result = transformSubscriptionAsCustomer(makeSubscription())
    expect(result.tags).not.toContain('cancelled')
  })

  it('maps subscription_created_on to createdAt', () => {
    const result = transformSubscriptionAsCustomer(makeSubscription())
    expect(result.createdAt).toBe('2024-01-15T10:30:00.000Z')
  })

  it('preserves the raw object in metadata verbatim', () => {
    const raw = makeSubscription()
    const result = transformSubscriptionAsCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes CustomerSchema validation', () => {
    const result = transformSubscriptionAsCustomer(makeSubscription())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles missing subscriber_name gracefully', () => {
    const result = transformSubscriptionAsCustomer(
      makeSubscription({ subscriber_name: null }),
    )
    expect(result.firstName).toBeUndefined()
    expect(result.lastName).toBeUndefined()
  })
})
