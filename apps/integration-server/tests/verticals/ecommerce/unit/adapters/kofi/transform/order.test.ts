import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  parseAmount,
  mapFinancialStatus,
  mapFulfillmentStatus,
  buildLineItems,
  type KofiWebhookPayload,
} from '../../../../../../../src/verticals/ecommerce/adapters/kofi/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeDonation(overrides: Partial<KofiWebhookPayload> = {}): KofiWebhookPayload {
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

function makeShopOrder(overrides: Partial<KofiWebhookPayload> = {}): KofiWebhookPayload {
  return {
    verification_token: 'tok-abc',
    message_id: 'msg-002',
    timestamp: '2024-02-20T14:00:00Z',
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
      { direct_link_code: 'item-002', variation_name: 'Wallpaper Bundle', quantity: 2 },
    ],
    tier_name: null,
    shipping: null,
    ...overrides,
  }
}

function makeSubscription(overrides: Partial<KofiWebhookPayload> = {}): KofiWebhookPayload {
  return {
    verification_token: 'tok-abc',
    message_id: 'msg-003',
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

function makeCommission(overrides: Partial<KofiWebhookPayload> = {}): KofiWebhookPayload {
  return {
    verification_token: 'tok-abc',
    message_id: 'msg-004',
    timestamp: '2024-04-10T16:45:00Z',
    type: 'Commission',
    is_public: false,
    from_name: 'Carlos Rivera',
    message: 'Custom art request',
    amount: '50.00',
    url: 'https://ko-fi.com/commission',
    email: 'carlos@example.com',
    currency: 'USD',
    is_subscription_payment: false,
    is_first_subscription_payment: false,
    kofi_transaction_id: 'tx-com-001',
    shop_items: null,
    tier_name: null,
    shipping: null,
    ...overrides,
  }
}

// ── transformTransaction ──────────────────────────────────────────────────────

describe('transformTransaction (Ko-fi) — Donation', () => {
  it('uses kofi_transaction_id as the canonical id and orderNumber', () => {
    const result = transformTransaction(makeDonation())
    expect(result.id).toBe('tx-don-001')
    expect(result.orderNumber).toBe('tx-don-001')
  })

  it('maps from_name to the name field', () => {
    const result = transformTransaction(makeDonation())
    expect(result.name).toBe('Jane Doe')
  })

  it('maps email correctly', () => {
    const result = transformTransaction(makeDonation())
    expect(result.email).toBe('jane@example.com')
  })

  it('parses amount string to canonical totalPrice', () => {
    const result = transformTransaction(makeDonation())
    expect(result.totalPrice).toEqual({ amount: 300, currency: 'USD' })
  })

  it('includes the transaction type in tags', () => {
    const result = transformTransaction(makeDonation())
    expect(result.tags).toContain('Donation')
  })

  it('maps message to canonical note', () => {
    const result = transformTransaction(makeDonation())
    expect(result.note).toBe('Keep up the great work!')
  })

  it('maps timestamp to createdAt', () => {
    const result = transformTransaction(makeDonation())
    expect(result.createdAt).toBe('2024-01-15T10:30:00Z')
  })

  it('sets financialStatus to PAID', () => {
    const result = transformTransaction(makeDonation())
    expect(result.financialStatus).toBe('PAID')
  })

  it('sets fulfillmentStatus to FULFILLED', () => {
    const result = transformTransaction(makeDonation())
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('preserves the raw payload in metadata', () => {
    const raw = makeDonation()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes OrderSchema validation', () => {
    const result = transformTransaction(makeDonation())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('creates a single synthetic line item for non-shop transactions', () => {
    const result = transformTransaction(makeDonation())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.title).toBe('Ko-fi Tip')
    expect(result.lineItems![0]!.quantity).toBe(1)
    expect(result.lineItems![0]!.price).toEqual({ amount: 300, currency: 'USD' })
  })
})

describe('transformTransaction (Ko-fi) — Shop Order', () => {
  it('creates one line item per shop_items entry', () => {
    const result = transformTransaction(makeShopOrder())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]!.productId).toBe('item-001')
    expect(result.lineItems![0]!.title).toBe('Digital Sticker Pack')
    expect(result.lineItems![1]!.productId).toBe('item-002')
    expect(result.lineItems![1]!.title).toBe('Wallpaper Bundle')
    expect(result.lineItems![1]!.quantity).toBe(2)
  })

  it('tags include "Shop Order"', () => {
    const result = transformTransaction(makeShopOrder())
    expect(result.tags).toContain('Shop Order')
  })

  it('passes OrderSchema validation for shop orders', () => {
    const result = transformTransaction(makeShopOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('transformTransaction (Ko-fi) — Subscription', () => {
  it('includes subscription tags', () => {
    const result = transformTransaction(makeSubscription())
    expect(result.tags).toContain('Subscription')
    expect(result.tags).toContain('subscription_payment')
    expect(result.tags).toContain('first_subscription_payment')
  })

  it('uses the correct currency (EUR)', () => {
    const result = transformTransaction(makeSubscription())
    expect(result.currency).toBe('EUR')
    expect(result.totalPrice).toEqual({ amount: 500, currency: 'EUR' })
  })

  it('synthesises a subscription line item title with tier name', () => {
    const result = transformTransaction(makeSubscription())
    expect(result.lineItems![0]!.title).toBe('Ko-fi Subscription — Silver Supporter')
  })

  it('synthesises a subscription line item title without tier name', () => {
    const result = transformTransaction(makeSubscription({ tier_name: null }))
    expect(result.lineItems![0]!.title).toBe('Ko-fi Tip')
  })
})

describe('transformTransaction (Ko-fi) — Commission', () => {
  it('synthesises a commission line item title', () => {
    const result = transformTransaction(makeCommission())
    expect(result.lineItems![0]!.title).toBe('Ko-fi Commission')
  })

  it('maps large amounts correctly', () => {
    const result = transformTransaction(makeCommission())
    expect(result.totalPrice).toEqual({ amount: 5000, currency: 'USD' })
  })
})

describe('transformTransaction (Ko-fi) — edge cases', () => {
  it('falls back to message_id when kofi_transaction_id is missing', () => {
    const payload = makeDonation({ kofi_transaction_id: undefined })
    const result = transformTransaction(payload)
    expect(result.id).toBe('msg-001')
  })

  it('handles missing amount gracefully', () => {
    const result = transformTransaction(makeDonation({ amount: undefined }))
    expect(result.totalPrice).toBeUndefined()
  })

  it('defaults currency to USD when absent', () => {
    const result = transformTransaction(makeDonation({ currency: undefined }))
    expect(result.currency).toBe('USD')
  })

  it('omits note when message is null', () => {
    const result = transformTransaction(makeDonation({ message: null }))
    expect(result.note).toBeUndefined()
  })
})

// ── parseAmount ───────────────────────────────────────────────────────────────

describe('parseAmount (Ko-fi)', () => {
  it('parses a string amount to a money object', () => {
    expect(parseAmount('3.00', 'USD')).toEqual({ amount: 300, currency: 'USD' })
    expect(parseAmount('19.99', 'EUR')).toEqual({ amount: 1999, currency: 'EUR' })
    expect(parseAmount('0', 'GBP')).toEqual({ amount: 0, currency: 'GBP' })
  })

  it('returns undefined for undefined input', () => {
    expect(parseAmount(undefined, 'USD')).toBeUndefined()
  })

  it('returns undefined for non-numeric strings', () => {
    expect(parseAmount('not-a-number', 'USD')).toBeUndefined()
  })
})

// ── mapFinancialStatus / mapFulfillmentStatus ─────────────────────────────────

describe('mapFinancialStatus (Ko-fi)', () => {
  it('always returns PAID because webhooks fire on successful payment', () => {
    const payload = makeDonation()
    expect(mapFinancialStatus(payload)).toBe('PAID')
  })
})

describe('mapFulfillmentStatus (Ko-fi)', () => {
  it('always returns FULFILLED for digital delivery', () => {
    expect(mapFulfillmentStatus(makeDonation())).toBe('FULFILLED')
    expect(mapFulfillmentStatus(makeShopOrder())).toBe('FULFILLED')
    expect(mapFulfillmentStatus(makeSubscription())).toBe('FULFILLED')
  })
})

// ── buildLineItems ────────────────────────────────────────────────────────────

describe('buildLineItems (Ko-fi)', () => {
  it('returns a single synthetic item for donations', () => {
    const items = buildLineItems(makeDonation())
    expect(items).toHaveLength(1)
    expect(items[0]!.title).toBe('Ko-fi Tip')
  })

  it('returns one item per shop entry for shop orders', () => {
    const items = buildLineItems(makeShopOrder())
    expect(items).toHaveLength(2)
  })

  it('sets metadata on each shop item line item', () => {
    const items = buildLineItems(makeShopOrder())
    expect(items[0]!.metadata).toBeDefined()
    expect((items[0]!.metadata as Record<string, unknown>)['direct_link_code']).toBe('item-001')
  })
})
