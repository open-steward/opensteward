import { describe, it, expect } from 'vitest'
import {
  transformSupporter,
  transformSubscription,
  transformOrder,
  parseAmount,
  type BmacSupporter,
  type BmacSubscription,
  type BmacOrderSource,
} from '../../../../../../../src/verticals/ecommerce/adapters/buymeacoffee/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSupporter(overrides: Partial<BmacSupporter> = {}): BmacSupporter {
  return {
    support_id: 12345,
    support_note: 'Keep it up!',
    support_coffees: 3,
    transaction_id: 'txn_abc',
    support_visibility: 1,
    support_created_on: '2024-01-15T10:30:00.000Z',
    support_updated_on: '2024-01-15T10:30:00.000Z',
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

// ── transformSupporter ────────────────────────────────────────────────────────

describe('transformSupporter (Buy Me a Coffee)', () => {
  it('stringifies support_id as the canonical id and orderNumber', () => {
    const result = transformSupporter(makeSupporter())
    expect(result.id).toBe('12345')
    expect(result.orderNumber).toBe('12345')
  })

  it('maps payer_name to canonical name', () => {
    const result = transformSupporter(makeSupporter())
    expect(result.name).toBe('John Doe')
  })

  it('falls back to supporter_name when payer_name is absent', () => {
    const result = transformSupporter(
      makeSupporter({ payer_name: null, supporter_name: 'John D.' }),
    )
    expect(result.name).toBe('John D.')
  })

  it('maps payer_email to canonical email', () => {
    const result = transformSupporter(makeSupporter())
    expect(result.email).toBe('john@example.com')
  })

  it('falls back to supporter_email when payer_email is absent', () => {
    const result = transformSupporter(
      makeSupporter({ payer_email: null, supporter_email: 'fallback@example.com' }),
    )
    expect(result.email).toBe('fallback@example.com')
  })

  it('computes totalPrice as coffees × price', () => {
    const result = transformSupporter(makeSupporter()) // 3 coffees × $5.00
    expect(result.totalPrice).toEqual({ amount: 1500, currency: 'USD' })
  })

  it('sets currency from support_currency', () => {
    const result = transformSupporter(makeSupporter({ support_currency: 'EUR' }))
    expect(result.currency).toBe('EUR')
  })

  it('defaults currency to USD when support_currency is absent', () => {
    const result = transformSupporter(makeSupporter({ support_currency: null }))
    expect(result.currency).toBe('USD')
  })

  it('sets financialStatus to PAID for non-refunded supporters', () => {
    const result = transformSupporter(makeSupporter({ is_refunded: false }))
    expect(result.financialStatus).toBe('PAID')
  })

  it('sets financialStatus to REFUNDED for refunded supporters', () => {
    const result = transformSupporter(makeSupporter({ is_refunded: true }))
    expect(result.financialStatus).toBe('REFUNDED')
  })

  it('always sets fulfillmentStatus to FULFILLED', () => {
    const result = transformSupporter(makeSupporter())
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('creates a single line item with correct quantity and unit price', () => {
    const result = transformSupporter(makeSupporter())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.quantity).toBe(3)
    expect(result.lineItems![0]!.price).toEqual({ amount: 500, currency: 'USD' })
  })

  it('maps support_note to canonical note', () => {
    const result = transformSupporter(makeSupporter())
    expect(result.note).toBe('Keep it up!')
  })

  it('maps transaction_id to transactionIds', () => {
    const result = transformSupporter(makeSupporter())
    expect(result.transactionIds).toContain('txn_abc')
  })

  it('includes "supporter" in tags', () => {
    const result = transformSupporter(makeSupporter())
    expect(result.tags).toContain('supporter')
  })

  it('includes "refunded" tag when is_refunded is true', () => {
    const result = transformSupporter(makeSupporter({ is_refunded: true }))
    expect(result.tags).toContain('refunded')
  })

  it('maps support_created_on to createdAt', () => {
    const result = transformSupporter(makeSupporter())
    expect(result.createdAt).toBe('2024-01-15T10:30:00.000Z')
  })

  it('preserves the raw object in metadata verbatim', () => {
    const raw = makeSupporter()
    const result = transformSupporter(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes OrderSchema validation', () => {
    const result = transformSupporter(makeSupporter())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('handles missing support_coffees by defaulting quantity to 1', () => {
    const result = transformSupporter(
      makeSupporter({ support_coffees: null }),
    )
    expect(result.lineItems![0]!.quantity).toBe(1)
  })

  it('omits totalPrice when support_coffee_price is null', () => {
    const result = transformSupporter(
      makeSupporter({ support_coffee_price: null }),
    )
    expect(result.totalPrice).toBeUndefined()
  })
})

// ── transformSubscription ─────────────────────────────────────────────────────

describe('transformSubscription (Buy Me a Coffee)', () => {
  it('stringifies subscription_id as the canonical id and orderNumber', () => {
    const result = transformSubscription(makeSubscription())
    expect(result.id).toBe('999')
    expect(result.orderNumber).toBe('999')
  })

  it('maps subscriber_name to canonical name', () => {
    const result = transformSubscription(makeSubscription())
    expect(result.name).toBe('Jane Smith')
  })

  it('maps subscriber_email to canonical email', () => {
    const result = transformSubscription(makeSubscription())
    expect(result.email).toBe('jane@example.com')
  })

  it('computes totalPrice as coffee_num × coffee_price', () => {
    const result = transformSubscription(makeSubscription()) // 1 × $5.00
    expect(result.totalPrice).toEqual({ amount: 500, currency: 'USD' })
  })

  it('sets currency from subscription_currency', () => {
    const result = transformSubscription(
      makeSubscription({ subscription_currency: 'GBP' }),
    )
    expect(result.currency).toBe('GBP')
  })

  it('defaults currency to USD when subscription_currency is absent', () => {
    const result = transformSubscription(
      makeSubscription({ subscription_currency: null }),
    )
    expect(result.currency).toBe('USD')
  })

  it('sets financialStatus to PAID for active subscriptions', () => {
    const result = transformSubscription(
      makeSubscription({ subscription_is_cancelled: false }),
    )
    expect(result.financialStatus).toBe('PAID')
  })

  it('sets financialStatus to VOIDED for cancelled subscriptions', () => {
    const result = transformSubscription(
      makeSubscription({ subscription_is_cancelled: true }),
    )
    expect(result.financialStatus).toBe('VOIDED')
  })

  it('always sets fulfillmentStatus to FULFILLED', () => {
    const result = transformSubscription(makeSubscription())
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('creates a single line item with membership_level_name in the title', () => {
    const result = transformSubscription(makeSubscription())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.title).toBe('Buy Me a Coffee — Silver Member')
  })

  it('uses generic title when membership_level_name is absent', () => {
    const result = transformSubscription(
      makeSubscription({ membership_level_name: null }),
    )
    expect(result.lineItems![0]!.title).toBe('Buy Me a Coffee — Membership')
  })

  it('includes "subscription" in tags', () => {
    const result = transformSubscription(makeSubscription())
    expect(result.tags).toContain('subscription')
  })

  it('includes tier tag from membership_level_name', () => {
    const result = transformSubscription(makeSubscription())
    expect(result.tags).toContain('tier:Silver Member')
  })

  it('includes "cancelled" tag when subscription_is_cancelled is true', () => {
    const result = transformSubscription(
      makeSubscription({ subscription_is_cancelled: true }),
    )
    expect(result.tags).toContain('cancelled')
  })

  it('includes "cancel_at_period_end" tag when subscription_is_cancelled_at_period_end is true', () => {
    const result = transformSubscription(
      makeSubscription({ subscription_is_cancelled_at_period_end: true }),
    )
    expect(result.tags).toContain('cancel_at_period_end')
  })

  it('maps subscription_created_on to createdAt', () => {
    const result = transformSubscription(makeSubscription())
    expect(result.createdAt).toBe('2024-01-15T10:30:00.000Z')
  })

  it('maps subscription_cancelled_on to cancelledAt when set', () => {
    const result = transformSubscription(
      makeSubscription({ subscription_cancelled_on: '2024-06-01T00:00:00.000Z' }),
    )
    expect(result.cancelledAt).toBe('2024-06-01T00:00:00.000Z')
  })

  it('preserves the raw object in metadata verbatim', () => {
    const raw = makeSubscription()
    const result = transformSubscription(raw)
    expect(result.metadata).toBe(raw)
  })

  it('passes OrderSchema validation', () => {
    const result = transformSubscription(makeSubscription())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

// ── transformOrder (dispatch) ─────────────────────────────────────────────────

describe('transformOrder (Buy Me a Coffee dispatch)', () => {
  it('dispatches supporter source correctly', () => {
    const source: BmacOrderSource = {
      kind: 'supporter',
      raw: makeSupporter(),
    }
    const result = transformOrder(source)
    expect(result.id).toBe('12345')
    expect(result.tags).toContain('supporter')
  })

  it('dispatches subscription source correctly', () => {
    const source: BmacOrderSource = {
      kind: 'subscription',
      raw: makeSubscription(),
    }
    const result = transformOrder(source)
    expect(result.id).toBe('999')
    expect(result.tags).toContain('subscription')
  })
})

// ── parseAmount ───────────────────────────────────────────────────────────────

describe('parseAmount (Buy Me a Coffee)', () => {
  it('parses a decimal price string to a money object', () => {
    expect(parseAmount('9.99', 'USD')).toEqual({ amount: 999, currency: 'USD' })
    expect(parseAmount('5.00', 'EUR')).toEqual({ amount: 500, currency: 'EUR' })
    expect(parseAmount('0', 'GBP')).toEqual({ amount: 0, currency: 'GBP' })
  })

  it('returns undefined for null input', () => {
    expect(parseAmount(null, 'USD')).toBeUndefined()
  })

  it('returns undefined for undefined input', () => {
    expect(parseAmount(undefined, 'USD')).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    expect(parseAmount('', 'USD')).toBeUndefined()
  })

  it('returns undefined for non-numeric strings', () => {
    expect(parseAmount('not-a-number', 'USD')).toBeUndefined()
  })
})
