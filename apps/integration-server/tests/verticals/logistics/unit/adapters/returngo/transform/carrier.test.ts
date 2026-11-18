import { describe, it, expect } from 'vitest'
import { transformRmaToCarrier } from '../../../../../../../src/verticals/logistics/adapters/returngo/transform/carrier'
import type { ReturnGoRma } from '../../../../../../../src/verticals/logistics/adapters/returngo/transform/rma'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeRaw(overrides: Partial<ReturnGoRma> = {}): ReturnGoRma {
  return {
    id: 'rma-001',
    carrier: 'USPS',
    shipment: {
      carrier: 'USPS',
      tracking_number: 'T1',
      label_url: 'https://example.com/label.pdf',
    },
    ...overrides,
  }
}

// ─── transformRmaToCarrier ────────────────────────────────────────────────────

describe('ReturnGO transformRmaToCarrier', () => {
  it('returns a Carrier with id, name, code from top-level carrier field', () => {
    const result = transformRmaToCarrier(makeRaw())
    expect(result?.id).toBe('USPS')
    expect(result?.name).toBe('USPS')
    expect(result?.code).toBe('USPS')
  })

  it('sets isActive to true', () => {
    expect(transformRmaToCarrier(makeRaw())?.isActive).toBe(true)
  })

  it('falls back to shipment.carrier when top-level carrier is absent', () => {
    const result = transformRmaToCarrier(makeRaw({ carrier: null }))
    expect(result?.code).toBe('USPS')
  })

  it('returns undefined when no carrier info present', () => {
    const result = transformRmaToCarrier({ id: 'rma-002' })
    expect(result).toBeUndefined()
  })

  it('stores raw RMA as metadata', () => {
    const raw = makeRaw()
    expect(transformRmaToCarrier(raw)?.metadata).toBe(raw)
  })

  it('passes CarrierSchema.parse without throwing', () => {
    const result = transformRmaToCarrier(makeRaw())
    expect(() => CarrierSchema.parse(result)).not.toThrow()
  })
})
