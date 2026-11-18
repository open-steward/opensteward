import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  type Ship24Courier,
} from '../../../../../../../src/verticals/logistics/adapters/ship24/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeCourier(overrides: Partial<Ship24Courier> = {}): Ship24Courier {
  return {
    courierCode: 'dhl-express',
    courierName: 'DHL Express',
    courierUrl: 'https://www.dhl.com/en/express/tracking.html?AWB={trackingNumber}',
    courierCountryCode: 'DE',
    ...overrides,
  }
}

// ─── transformCarrier ─────────────────────────────────────────────────────────

describe('transformCarrier', () => {
  it('maps courierCode → id and code', () => {
    const result = transformCarrier(makeCourier())
    expect(result.id).toBe('dhl-express')
    expect(result.code).toBe('dhl-express')
  })

  it('maps courierName → name', () => {
    expect(transformCarrier(makeCourier()).name).toBe('DHL Express')
  })

  it('maps courierUrl → trackingUrlTemplate', () => {
    const result = transformCarrier(makeCourier())
    expect(result.trackingUrlTemplate).toBe(
      'https://www.dhl.com/en/express/tracking.html?AWB={trackingNumber}',
    )
  })

  it('sets isActive to true', () => {
    expect(transformCarrier(makeCourier()).isActive).toBe(true)
  })

  it('uses undefined for trackingUrlTemplate when courierUrl is null', () => {
    const result = transformCarrier(makeCourier({ courierUrl: null }))
    expect(result.trackingUrlTemplate).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => CarrierSchema.parse(transformCarrier(makeCourier()))).not.toThrow()
  })

  it('passes metadata as raw object reference', () => {
    const raw = makeCourier()
    expect(transformCarrier(raw).metadata).toBe(raw)
  })
})
