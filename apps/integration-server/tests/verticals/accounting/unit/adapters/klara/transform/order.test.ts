import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type KlaraOffer,
} from '../../../../../../../src/verticals/accounting/adapters/klara/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'

function makeOffer(overrides: Partial<KlaraOffer> = {}): KlaraOffer {
  return {
    id: 'offer-1',
    offer_number: 'OFF-2024-001',
    status: 'open',
    contact_id: 'cont-1',
    currency: 'CHF',
    total_amount: 15000,
    offer_date: '2024-07-01T00:00:00.000Z',
    expiry_date: '2024-08-01T00:00:00.000Z',
    created_at: '2024-07-01T00:00:00.000Z',
    updated_at: '2024-07-02T00:00:00.000Z',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core fields', () => {
    const result = transformOrder(makeOffer())
    expect(result.id).toBe('offer-1')
    expect(result.type).toBe('SALES')
    expect(result.contactId).toBe('cont-1')
    expect(result.currency).toBe('CHF')
    expect(result.totalAmount).toBe(15000)
  })

  it('hardcodes type to SALES', () => {
    expect(transformOrder(makeOffer()).type).toBe('SALES')
  })

  it('maps status draft to DRAFT', () => {
    expect(transformOrder(makeOffer({ status: 'draft' })).status).toBe('DRAFT')
  })

  it('maps status open to ACTIVE', () => {
    expect(transformOrder(makeOffer({ status: 'open' })).status).toBe('ACTIVE')
  })

  it('maps status accepted to COMPLETED', () => {
    expect(transformOrder(makeOffer({ status: 'accepted' })).status).toBe('COMPLETED')
  })

  it('maps status cancelled to CANCELLED', () => {
    expect(transformOrder(makeOffer({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('parses offer_date as postedAt', () => {
    expect(transformOrder(makeOffer()).postedAt).toEqual(new Date('2024-07-01T00:00:00.000Z'))
  })

  it('passes schema validation', () => {
    expect(() => OrderSchema.parse(transformOrder(makeOffer()))).not.toThrow()
  })
})
