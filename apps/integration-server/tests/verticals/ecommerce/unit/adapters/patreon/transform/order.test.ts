import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawPatreonPledge,
} from '../../../../../../../src/verticals/ecommerce/adapters/patreon/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'
import type { FlatResource } from '../../../../../../../src/verticals/ecommerce/adapters/patreon/client'

function makePledge(overrides: Partial<RawPatreonPledge> = {}): RawPatreonPledge {
  return {
    id: 'pledge-001',
    email: 'patron@example.com',
    full_name: 'Jane Doe',
    patron_status: 'active_patron',
    currently_entitled_amount_cents: 2000,
    lifetime_support_cents: 24000,
    last_charge_date: '2024-03-01T00:00:00.000+00:00',
    last_charge_status: 'Paid',
    pledge_relationship_start: '2023-03-01T00:00:00.000+00:00',
    will_pay_amount_cents: 2000,
    pledge_cadence: 1,
    _type: 'member',
    _relationships: {
      campaign: { data: { type: 'campaign', id: 'camp-001' } },
      currently_entitled_tiers: {
        data: [{ type: 'tier', id: 'tier-200' }],
      },
    },
    _included: [
      {
        id: 'tier-200',
        _type: 'tier',
        title: 'Premium Patron',
        amount_cents: 2000,
        description: 'Premium access',
      } as unknown as FlatResource,
    ],
    ...overrides,
  }
}

describe('transformOrder (Patreon Pledge)', () => {
  it('maps core pledge fields to order', () => {
    const result = transformOrder(makePledge())
    expect(result.id).toBe('pledge-001')
    expect(result.orderNumber).toBe('pledge-001')
    expect(result.name).toBe('Pledge #pledge-001')
    expect(result.email).toBe('patron@example.com')
    expect(result.currency).toBe('USD')
  })

  it('maps active_patron to PAID/FULFILLED', () => {
    const result = transformOrder(makePledge())
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps declined_patron to PENDING/UNFULFILLED', () => {
    const result = transformOrder(makePledge({ patron_status: 'declined_patron' }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps former_patron to VOIDED with cancellation info', () => {
    const result = transformOrder(makePledge({ patron_status: 'former_patron' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.cancelledAt).toBe('2024-03-01T00:00:00.000+00:00')
    expect(result.cancelReason).toBe('Patron cancelled pledge')
  })

  it('maps null patron_status to PENDING', () => {
    const result = transformOrder(makePledge({ patron_status: null }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('converts amount from cents to dollars', () => {
    const result = transformOrder(makePledge())
    expect(result.totalPrice).toEqual({ amount: 20, currency: 'USD' })
  })

  it('builds line items from entitled tiers', () => {
    const result = transformOrder(makePledge())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.id).toBe('tier-200')
    expect(result.lineItems![0]!.title).toBe('Premium Patron')
    expect(result.lineItems![0]!.price).toEqual({ amount: 20, currency: 'USD' })
    expect(result.lineItems![0]!.quantity).toBe(1)
  })

  it('synthesizes line item when no tiers included', () => {
    const result = transformOrder(makePledge({
      _included: [],
      _relationships: { campaign: { data: { type: 'campaign', id: 'camp-001' } } },
    }))
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.id).toBe('pledge-001:pledge')
    expect(result.lineItems![0]!.title).toBe('Patreon Pledge')
  })

  it('includes campaign metadata', () => {
    const result = transformOrder(makePledge())
    expect(result.metadata['campaignId']).toBe('camp-001')
    expect(result.metadata['patronStatus']).toBe('active_patron')
    expect(result.metadata['lifetimeSupportCents']).toBe(24000)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makePledge())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('untransformOrder (Patreon)', () => {
  it('maps note to attributes', () => {
    const body = untransformOrder({
      note: 'Updated note',
    }) as { data: { type: string; attributes: Record<string, unknown> } }
    expect(body.data.type).toBe('member')
    expect(body.data.attributes['note']).toBe('Updated note')
  })
})
