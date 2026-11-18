/**
 * Metapack carriers. Fixtures are the documented example responses:
 *   https://dev.metapack.com/shipping/guides/get-carriers/ (GET /shipping/v1/carriers)
 *   [{ "code": "DP05", "name": "Deutsche Post International" },
 *    { "code": "ROYALMAIL", "name": "Royal Mail" }]
 *   https://dev.metapack.com/shipping/guides/get-carrier-services/
 *   (GET /shipping/v1/carriers/DP05/services)
 *   [{ "code": "DP05PACKETPLUS", "name": "Packet Plus" }, ...]
 */
import { describe, it, expect } from 'vitest'
import { transformCarrier } from '../../../../../../../src/verticals/logistics/adapters/metapack/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

const CARRIERS = [
  { code: 'DP05', name: 'Deutsche Post International' },
  { code: 'ROYALMAIL', name: 'Royal Mail' },
]
const SERVICES = [
  { code: 'DP05PACKETPLUS', name: 'Packet Plus' },
  { code: 'DP05PACKETPRIORITY', name: 'Packet Priority' },
  { code: 'DP05PACKETSTANDARD', name: 'Packet Standard' },
]

describe('metapack transformCarrier', () => {
  it('parses with CarrierSchema; the code is the id', () => {
    for (const raw of CARRIERS) {
      const c = CarrierSchema.parse(transformCarrier(raw))
      expect(c.id).toBe(raw.code)
      expect(c.code).toBe(raw.code)
      expect(c.name).toBe(raw.name)
      expect(c.services).toBeUndefined()
    }
  })

  it('invents nothing the documented shape lacks', () => {
    const c = CarrierSchema.parse(transformCarrier(CARRIERS[0]!))
    expect(c.isActive).toBeUndefined()
    expect(c.trackingUrlTemplate).toBeUndefined()
    expect(c.metadata).toEqual(CARRIERS[0])
  })

  it('maps the carrier services', () => {
    const c = CarrierSchema.parse(transformCarrier(CARRIERS[0]!, SERVICES))
    expect(c.services).toEqual([
      { code: 'DP05PACKETPLUS', name: 'Packet Plus' },
      { code: 'DP05PACKETPRIORITY', name: 'Packet Priority' },
      { code: 'DP05PACKETSTANDARD', name: 'Packet Standard' },
    ])
  })

  it('drops a service with no code rather than inventing one', () => {
    const c = CarrierSchema.parse(
      transformCarrier(CARRIERS[0]!, [{ name: 'Nameless' }, SERVICES[0]!]),
    )
    expect(c.services).toEqual([{ code: 'DP05PACKETPLUS', name: 'Packet Plus' }])
  })
})
