import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawSharetribeTransaction,
  type SharetribeLineItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/sharetribe/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeLineItem(overrides: Partial<SharetribeLineItem> = {}): SharetribeLineItem {
  return {
    code: 'line-item/night',
    unitPrice: { amount: 5000, currency: 'USD' },
    quantity: 3,
    lineTotal: { amount: 15000, currency: 'USD' },
    reversal: false,
    includeFor: ['customer'],
    ...overrides,
  }
}

function makeTransaction(overrides: Partial<RawSharetribeTransaction> = {}): RawSharetribeTransaction {
  return {
    id: { uuid: 'txn-uuid-001' },
    type: 'transaction',
    attributes: {
      state: 'accepted',
      lastTransition: 'transition/accept',
      lastTransitionedAt: '2026-01-15T10:00:00.000Z',
      payinTotal: { amount: 15000, currency: 'USD' },
      payoutTotal: { amount: 13500, currency: 'USD' },
      lineItems: [makeLineItem()],
      protectedData: { bookingDetails: 'room 101' },
      metadata: { source: 'web' },
      createdAt: '2026-01-15T09:30:00.000Z',
    },
    relationships: {
      customer: { data: { uuid: 'user-001' } },
      provider: { data: { uuid: 'provider-001' } },
      listing: { data: { uuid: 'listing-001' } },
      booking: { data: { uuid: 'booking-001' } },
    },
    ...overrides,
  }
}

// ── transformTransaction ──────────────────────────────────────────────────────

describe('transformTransaction (Sharetribe)', () => {
  it('maps id from uuid wrapper', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('txn-uuid-001')
  })

  it('maps customerId from customer relationship', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.customerId).toBe('user-001')
  })

  it('maps currency from payinTotal', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.currency).toBe('USD')
  })

  it('maps totalPrice from payinTotal (already minor units)', () => {
    const result = transformTransaction(makeTransaction())
    // Sharetribe payinTotal is already in minor units
    expect(result.totalPrice).toEqual({ amount: 15000, currency: 'USD' })
  })

  it('maps accepted state to PAID financial status', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps accepted state to PARTIAL fulfillment status', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.fulfillmentStatus).toBe('PARTIAL')
  })

  it('maps pending-payment state to PENDING financial status', () => {
    const raw = makeTransaction()
    raw.attributes.state = 'pending-payment'
    const result = transformTransaction(raw)
    expect(result.financialStatus).toBe('PENDING')
  })

  it('maps cancelled state to VOIDED financial and RESTOCKED fulfillment', () => {
    const raw = makeTransaction()
    raw.attributes.state = 'cancelled'
    const result = transformTransaction(raw)
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('RESTOCKED')
  })

  it('maps delivered state to FULFILLED fulfillment status', () => {
    const raw = makeTransaction()
    raw.attributes.state = 'delivered'
    const result = transformTransaction(raw)
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps non-reversal line items', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.title).toBe('line-item/night')
    expect(li.quantity).toBe(3)
    expect(li.price).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('filters out reversal line items', () => {
    const raw = makeTransaction()
    raw.attributes.lineItems = [makeLineItem(), makeLineItem({ reversal: true, code: 'line-item/night-reversal' })]
    const result = transformTransaction(raw)
    expect(result.lineItems).toHaveLength(1)
  })

  it('maps processedAt from lastTransitionedAt', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.processedAt).toBe('2026-01-15T10:00:00.000Z')
  })

  it('stores listingId and providerId in metadata', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.metadata['listingId']).toBe('listing-001')
    expect(result.metadata['providerId']).toBe('provider-001')
  })

  it('handles missing relationships gracefully', () => {
    const raw = makeTransaction()
    delete raw.relationships
    const result = transformTransaction(raw)
    expect(result.customerId).toBeUndefined()
  })

  it('produces a payload satisfying OrderSchema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
