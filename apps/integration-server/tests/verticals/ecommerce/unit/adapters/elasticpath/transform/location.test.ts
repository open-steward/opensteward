import { describe, it, expect } from 'vitest'
import {
  syntheticLocation,
  SYNTHETIC_LOCATION_ID,
} from '../../../../../../../src/verticals/ecommerce/adapters/elasticpath/transform/location'
import { LocationSchema } from '../../../../../../../src/verticals/ecommerce/schema/location'

describe('syntheticLocation (Elastic Path)', () => {
  it('returns a synthetic default location', () => {
    const loc = syntheticLocation()
    expect(loc.id).toBe(SYNTHETIC_LOCATION_ID)
    expect(loc.name).toBe('Default Location')
    expect(loc.active).toBe(true)
    expect(loc.isFulfillmentCenter).toBe(true)
  })

  it('marks the location as synthetic in metadata', () => {
    const loc = syntheticLocation()
    expect((loc.metadata as { synthetic?: boolean }).synthetic).toBe(true)
  })

  it('produces a payload that satisfies LocationSchema', () => {
    const loc = syntheticLocation()
    expect(() => LocationSchema.parse(loc)).not.toThrow()
  })

  it('uses a stable ID constant', () => {
    expect(SYNTHETIC_LOCATION_ID).toBe('elasticpath-default')
  })
})
