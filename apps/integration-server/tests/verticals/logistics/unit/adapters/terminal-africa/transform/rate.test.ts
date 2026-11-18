import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type TerminalAfricaRate,
} from '../../../../../../../src/verticals/logistics/adapters/terminal-africa/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRate(overrides: Partial<TerminalAfricaRate> = {}): TerminalAfricaRate {
  return {
    rate_id: 'rate-007',
    id: 'rate-007',
    amount: '2500',
    currency: 'NGN',
    carrier_slug: 'dhl',
    carrier_id: 'dhl-ng',
    carrier_rate_description: 'DHL Express',
    delivery_eta: 2880, // 2 days in minutes
    delivery_date: '2024-03-05T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('terminal-africa transformRate', () => {
  it('prefers rate_id over id', () => {
    const r = transformRate(makeRate())
    expect(r.id).toBe('rate-007')
  })

  it('falls back to id when rate_id is absent', () => {
    const r = transformRate(makeRate({ rate_id: null }))
    expect(r.id).toBe('rate-007')
  })

  it('prefers carrier_slug for carrierId', () => {
    const r = transformRate(makeRate())
    expect(r.carrierId).toBe('dhl')
  })

  it('falls back to carrier_id when carrier_slug is absent', () => {
    const r = transformRate(makeRate({ carrier_slug: null }))
    expect(r.carrierId).toBe('dhl-ng')
  })

  it('maps carrier_rate_description → serviceCode', () => {
    const r = transformRate(makeRate())
    expect(r.serviceCode).toBe('DHL Express')
  })

  it('maps currency', () => {
    const r = transformRate(makeRate())
    expect(r.currency).toBe('NGN')
  })

  it('parses totalAmount from string amount', () => {
    const r = transformRate(makeRate())
    expect(r.totalAmount).toBe(2500)
  })

  it('converts delivery_eta minutes to days via ceiling', () => {
    // 2880 minutes = exactly 2 days → Math.ceil(2880/1440) = 2
    const r = transformRate(makeRate())
    expect(r.transitDays).toBe(2)
  })

  it('converts fractional days by ceiling', () => {
    // 1500 minutes → Math.ceil(1500/1440) = 2
    const r = transformRate(makeRate({ delivery_eta: 1500 }))
    expect(r.transitDays).toBe(2)
  })

  it('maps delivery_date → estimatedDeliveryAt as Date', () => {
    const r = transformRate(makeRate())
    expect(r.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps created_at → createdAt as Date', () => {
    const r = transformRate(makeRate())
    expect(r.createdAt).toBeInstanceOf(Date)
  })

  it('metadata references the raw object', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('passes RateSchema validation', () => {
    const result = transformRate(makeRate())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })

  it('handles null delivery_eta → no transitDays', () => {
    const r = transformRate(makeRate({ delivery_eta: null }))
    expect(r.transitDays).toBeUndefined()
  })
})
