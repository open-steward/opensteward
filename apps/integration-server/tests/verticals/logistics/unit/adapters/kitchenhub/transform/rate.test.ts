import { describe, it, expect } from 'vitest'
import {
  transformQuote,
  type KitchenHubQuote,
} from '../../../../../../../src/verticals/logistics/adapters/kitchenhub/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeQuote(o: Partial<KitchenHubQuote> = {}): KitchenHubQuote {
  return {
    id: 'quote-1',
    delivery_id: 'del-99',
    provider: 'swift',
    // Integer minor units (cents) — Amount schema requires .int()
    fee: 1500,
    currency: 'USD',
    estimated_delivery_at: '2024-03-01T00:00:00Z',
    // 90 min → 1 day via Math.ceil(90/(60*24))
    transit_minutes: 90,
    created_at: '2024-03-01T00:00:00Z',
    ...o,
  }
}

describe('kitchenhub transformQuote', () => {
  it('maps id', () => {
    expect(transformQuote(makeQuote()).id).toBe('quote-1')
  })

  it('falls back to delivery_id when id is absent', () => {
    expect(transformQuote(makeQuote({ id: undefined })).id).toBe('del-99')
  })

  it('maps provider to carrierId', () => {
    expect(transformQuote(makeQuote()).carrierId).toBe('swift')
  })

  it('defaults carrierId to kitchenhub when provider absent', () => {
    expect(transformQuote(makeQuote({ provider: undefined })).carrierId).toBe('kitchenhub')
  })

  it('maps serviceCode from provider', () => {
    expect(transformQuote(makeQuote()).serviceCode).toBe('swift_delivery')
  })

  it('defaults serviceCode when provider absent', () => {
    expect(transformQuote(makeQuote({ provider: undefined })).serviceCode).toBe(
      'kitchenhub_delivery',
    )
  })

  it('maps fee to totalAmount', () => {
    expect(transformQuote(makeQuote()).totalAmount).toBe(1500)
  })

  it('converts transit_minutes to transitDays via Math.ceil', () => {
    // 90 min → Math.ceil(90/1440) = 1
    expect(transformQuote(makeQuote({ transit_minutes: 90 })).transitDays).toBe(1)
    // 1440 min (exactly 1 day) → 1
    expect(transformQuote(makeQuote({ transit_minutes: 1440 })).transitDays).toBe(1)
    // 1441 min → 2
    expect(transformQuote(makeQuote({ transit_minutes: 1441 })).transitDays).toBe(2)
  })

  it('transitDays undefined when transit_minutes absent', () => {
    expect(transformQuote(makeQuote({ transit_minutes: undefined })).transitDays).toBeUndefined()
  })

  it('maps estimated_delivery_at to Date', () => {
    expect(transformQuote(makeQuote()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('attaches metadata', () => {
    const raw = makeQuote()
    expect(transformQuote(raw).metadata).toBe(raw)
  })

  it('validates against RateSchema', () => {
    const result = transformQuote(makeQuote())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })
})
