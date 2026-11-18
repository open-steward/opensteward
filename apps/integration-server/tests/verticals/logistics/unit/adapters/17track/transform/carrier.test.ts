import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  type Track17CarrierRaw,
} from '../../../../../../../src/verticals/logistics/adapters/17track/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

// ─── Factory ──────────────────────────────────────────────────────────────────

function makeRaw(overrides: Partial<Track17CarrierRaw> = {}): Track17CarrierRaw {
  return {
    key: 100,
    _name: 'UPS',
    _country: 1,
    _country_iso: 'US',
    _email: 'support@ups.com',
    _tel: '+1-800-742-5877',
    _url: 'https://www.ups.com/track/',
    ...overrides,
  }
}

// ─── transformCarrier ─────────────────────────────────────────────────────────

describe('transformCarrier', () => {
  it('maps id as string of key', () => {
    expect(transformCarrier(makeRaw()).id).toBe('100')
  })

  it('maps name from _name', () => {
    expect(transformCarrier(makeRaw()).name).toBe('UPS')
  })

  it('maps code as string of key', () => {
    expect(transformCarrier(makeRaw()).code).toBe('100')
  })

  it('sets isActive to true', () => {
    expect(transformCarrier(makeRaw()).isActive).toBe(true)
  })

  it('builds trackingUrlTemplate by stripping trailing slash from _url and appending /{trackingNumber}', () => {
    const result = transformCarrier(makeRaw({ _url: 'https://www.ups.com/track/' }))
    expect(result.trackingUrlTemplate).toBe('https://www.ups.com/track/{trackingNumber}')
  })

  it('works when _url has no trailing slash', () => {
    const result = transformCarrier(makeRaw({ _url: 'https://www.ups.com/track' }))
    expect(result.trackingUrlTemplate).toBe('https://www.ups.com/track/{trackingNumber}')
  })

  it('sets trackingUrlTemplate to undefined when _url is absent', () => {
    expect(transformCarrier(makeRaw({ _url: null })).trackingUrlTemplate).toBeUndefined()
  })

  it('sets name to undefined when _name is null', () => {
    expect(transformCarrier(makeRaw({ _name: null })).name).toBeUndefined()
  })

  it('passes metadata as the raw carrier object', () => {
    const raw = makeRaw()
    expect(transformCarrier(raw).metadata).toBe(raw)
  })

  it('handles large key values', () => {
    const result = transformCarrier(makeRaw({ key: 99999 }))
    expect(result.id).toBe('99999')
    expect(result.code).toBe('99999')
  })

  it('passes CarrierSchema validation', () => {
    expect(() => CarrierSchema.parse(transformCarrier(makeRaw()))).not.toThrow()
  })

  it('passes CarrierSchema validation with minimal raw data', () => {
    const raw: Track17CarrierRaw = { key: 200 }
    expect(() => CarrierSchema.parse(transformCarrier(raw))).not.toThrow()
  })
})
