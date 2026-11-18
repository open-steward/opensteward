import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/kofi/transform/customer'
import type { KofiWebhookPayload } from '../../../../../../../src/verticals/ecommerce/adapters/kofi/transform/order'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeDonationPayload(overrides: Partial<KofiWebhookPayload> = {}): KofiWebhookPayload {
  return {
    verification_token: 'tok-abc',
    message_id: 'msg-001',
    timestamp: '2024-01-15T10:30:00Z',
    type: 'Donation',
    is_public: true,
    from_name: 'Jane Doe',
    message: 'Keep up the great work!',
    amount: '3.00',
    url: 'https://ko-fi.com/support',
    email: 'jane@example.com',
    currency: 'USD',
    is_subscription_payment: false,
    is_first_subscription_payment: false,
    kofi_transaction_id: 'tx-don-001',
    shop_items: null,
    tier_name: null,
    shipping: null,
    ...overrides,
  }
}

function makeSubscriptionPayload(overrides: Partial<KofiWebhookPayload> = {}): KofiWebhookPayload {
  return {
    verification_token: 'tok-abc',
    message_id: 'msg-002',
    timestamp: '2024-03-01T09:00:00Z',
    type: 'Subscription',
    is_public: false,
    from_name: 'Alice Chen',
    message: null,
    amount: '5.00',
    url: 'https://ko-fi.com/support',
    email: 'alice@example.com',
    currency: 'EUR',
    is_subscription_payment: true,
    is_first_subscription_payment: true,
    kofi_transaction_id: 'tx-sub-001',
    shop_items: null,
    tier_name: 'Silver Supporter',
    shipping: null,
    ...overrides,
  }
}

function makeShopOrderPayload(overrides: Partial<KofiWebhookPayload> = {}): KofiWebhookPayload {
  return {
    verification_token: 'tok-abc',
    message_id: 'msg-003',
    timestamp: '2024-04-10T12:00:00Z',
    type: 'Shop Order',
    is_public: true,
    from_name: 'Bob Smith',
    message: null,
    amount: '9.99',
    url: 'https://ko-fi.com/shop/order',
    email: 'bob@example.com',
    currency: 'USD',
    is_subscription_payment: false,
    is_first_subscription_payment: false,
    kofi_transaction_id: 'tx-shop-001',
    shop_items: [
      { direct_link_code: 'item-001', variation_name: 'Digital Sticker Pack', quantity: 1 },
    ],
    tier_name: null,
    shipping: null,
    ...overrides,
  }
}

// ── transformCustomer ─────────────────────────────────────────────────────────

describe('transformCustomer (Ko-fi) — Donation supporter', () => {
  it('uses email as the canonical id', () => {
    const result = transformCustomer(makeDonationPayload())
    expect(result.id).toBe('jane@example.com')
  })

  it('maps email correctly', () => {
    const result = transformCustomer(makeDonationPayload())
    expect(result.email).toBe('jane@example.com')
  })

  it('splits from_name into firstName and lastName', () => {
    const result = transformCustomer(makeDonationPayload())
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
  })

  it('handles a single-word display name (no lastName)', () => {
    const result = transformCustomer(makeDonationPayload({ from_name: 'Mononym' }))
    expect(result.firstName).toBe('Mononym')
    expect(result.lastName).toBeUndefined()
  })

  it('handles a multi-word display name', () => {
    const result = transformCustomer(makeDonationPayload({ from_name: 'Mary Jane Watson' }))
    expect(result.firstName).toBe('Mary')
    expect(result.lastName).toBe('Jane Watson')
  })

  it('includes the transaction type in tags', () => {
    const result = transformCustomer(makeDonationPayload())
    expect(result.tags).toContain('Donation')
  })

  it('maps timestamp to createdAt', () => {
    const result = transformCustomer(makeDonationPayload())
    expect(result.createdAt).toBe('2024-01-15T10:30:00Z')
  })

  it('preserves the raw payload in metadata verbatim', () => {
    const raw = makeDonationPayload()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes CustomerSchema validation', () => {
    const result = transformCustomer(makeDonationPayload())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

describe('transformCustomer (Ko-fi) — Subscription supporter', () => {
  it('includes Subscription in tags', () => {
    const result = transformCustomer(makeSubscriptionPayload())
    expect(result.tags).toContain('Subscription')
  })

  it('includes tier tag when tier_name is present', () => {
    const result = transformCustomer(makeSubscriptionPayload())
    expect(result.tags).toContain('tier:Silver Supporter')
  })

  it('omits tier tag when tier_name is null', () => {
    const result = transformCustomer(makeSubscriptionPayload({ tier_name: null }))
    expect(result.tags?.some((t) => t.startsWith('tier:'))).toBe(false)
  })

  it('adds new_subscriber tag for first subscription payment', () => {
    const result = transformCustomer(makeSubscriptionPayload())
    expect(result.tags).toContain('new_subscriber')
  })

  it('does not add new_subscriber tag for renewal payments', () => {
    const result = transformCustomer(
      makeSubscriptionPayload({ is_first_subscription_payment: false }),
    )
    expect(result.tags).not.toContain('new_subscriber')
  })

  it('passes CustomerSchema validation', () => {
    const result = transformCustomer(makeSubscriptionPayload())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

describe('transformCustomer (Ko-fi) — Shop Order buyer', () => {
  it('uses email as the canonical id for shop order buyers', () => {
    const result = transformCustomer(makeShopOrderPayload())
    expect(result.id).toBe('bob@example.com')
  })

  it('includes Shop Order in tags', () => {
    const result = transformCustomer(makeShopOrderPayload())
    expect(result.tags).toContain('Shop Order')
  })
})

describe('transformCustomer (Ko-fi) — edge cases', () => {
  it('falls back to kofi_transaction_id as id when email is absent', () => {
    const result = transformCustomer(makeDonationPayload({ email: undefined }))
    expect(result.id).toBe('tx-don-001')
  })

  it('falls back to message_id as id when both email and kofi_transaction_id are absent', () => {
    const result = transformCustomer(
      makeDonationPayload({ email: undefined, kofi_transaction_id: undefined }),
    )
    expect(result.id).toBe('msg-001')
  })

  it('handles missing from_name gracefully', () => {
    const result = transformCustomer(makeDonationPayload({ from_name: undefined }))
    expect(result.firstName).toBeUndefined()
    expect(result.lastName).toBeUndefined()
  })

  it('returns undefined tags when type and tier are absent', () => {
    const result = transformCustomer(
      makeDonationPayload({ type: undefined, tier_name: undefined }),
    )
    expect(result.tags).toBeUndefined()
  })

  it('handles a minimal payload with only verification_token', () => {
    const minimal: KofiWebhookPayload = { verification_token: 'tok-abc' }
    const result = transformCustomer(minimal)
    expect(result.id).toBe('unknown')
    expect(result.email).toBeUndefined()
    expect(result.tags).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
