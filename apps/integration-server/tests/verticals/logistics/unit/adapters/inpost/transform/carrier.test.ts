import { describe, it, expect } from 'vitest'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'
import { transformCarrier } from '../../../../../../../src/verticals/logistics/adapters/inpost/transform/carrier'
import { SERVICES } from '../fixtures'

describe('inpost transformCarrier (GET /v1/services)', () => {
  it('describes InPost as one carrier whose services are the documented service ids', () => {
    const carrier = CarrierSchema.parse(transformCarrier(SERVICES))
    expect(carrier.id).toBe('inpost')
    expect(carrier.code).toBe('inpost')
    expect(carrier.services).toEqual([
      { code: 'inpost_locker_standard', name: 'Paczkomatowa standardowa' },
      { code: 'inpost_locker_economy', name: 'Paczkomatowa ekonomiczna' },
    ])
  })

  it('claims nothing the service list does not say', () => {
    const carrier = transformCarrier(SERVICES)
    expect(carrier.isActive).toBeUndefined()
    expect(carrier.trackingUrlTemplate).toBeUndefined()
  })

  it('keeps the raw service list in metadata', () => {
    expect(transformCarrier(SERVICES).metadata).toEqual({ services: SERVICES })
  })
})
