/**
 * EnviaYa carriers come from the documented services map:
 *
 *   Services > Get all services
 *   GET https://enviaya.com.mx/api/v2/carrier_services/services_map?api_key=API_KEY
 *   200: { "services": { "FedEx": [ { "INTERNATIONAL_PRIORITY": "International Priority" }, ... ],
 *                        "UPS": [ { "07": "UPS Express" }, ..., { "": null }, ... ], ... } }
 *
 * (Postman collection behind https://docs.enviaya.com.mx/.) Each key of
 * `services` is a carrier; each single-key object under it is one service,
 * code → name. The fixture is the documented example, verbatim.
 */
import { describe, it, expect } from 'vitest'
import { transformServicesMap } from '../../../../../../../src/verticals/logistics/adapters/enviaya/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'
import { SERVICES_MAP_EXAMPLE } from '../fixtures'

describe('transformServicesMap (documented services_map example)', () => {
  const carriers = transformServicesMap(SERVICES_MAP_EXAMPLE)

  it('yields one carrier per key of `services`, in the documented order', () => {
    expect(carriers.map((c) => c.id)).toEqual([
      'FedEx',
      'UPS',
      'DHL',
      'Paquetexpress',
      'Estafeta',
      'Redpack',
      'Minutos',
      'iVoy',
    ])
  })

  it('every carrier parses as CarrierSchema', () => {
    for (const carrier of carriers) CarrierSchema.parse(carrier)
  })

  it('names and codes the carrier by its services-map key', () => {
    const redpack = CarrierSchema.parse(carriers.find((c) => c.id === 'Redpack'))
    expect(redpack.name).toBe('Redpack')
    expect(redpack.code).toBe('Redpack')
  })

  it('maps each single-key service object to { code, name }', () => {
    const redpack = CarrierSchema.parse(carriers.find((c) => c.id === 'Redpack'))
    expect(redpack.services).toEqual([
      { code: '1', name: 'Express' },
      { code: '4', name: 'Metropolitano' },
      { code: '2', name: 'Ecoexpress' },
    ])
  })

  it('drops the UPS entry {"": null}, which has no service code', () => {
    const ups = CarrierSchema.parse(carriers.find((c) => c.id === 'UPS'))
    expect(ups.services?.some((s) => s.code === '')).toBe(false)
    // 13 documented entries: one is {"": null}, one repeats {"11": "UPS Standard"}.
    expect(SERVICES_MAP_EXAMPLE.services?.['UPS']).toHaveLength(13)
    expect(
      SERVICES_MAP_EXAMPLE.services?.['UPS']?.filter((e) => e['11'] === 'UPS Standard'),
    ).toHaveLength(2)
    expect(ups.services).toHaveLength(11)
  })

  it('keeps a code the example repeats under a different name, and drops only exact repeats', () => {
    const ups = CarrierSchema.parse(carriers.find((c) => c.id === 'UPS'))
    expect(ups.services?.filter((s) => s.code === '07')).toEqual([
      { code: '07', name: 'UPS Express' },
      { code: '07', name: 'UPS Worldwide Express' },
    ])
    const fedex = CarrierSchema.parse(carriers.find((c) => c.id === 'FedEx'))
    // "FEDEX_2_DAY_FREIGHT": "2 Day Freight" appears twice in the example.
    expect(
      SERVICES_MAP_EXAMPLE.services?.['FedEx']?.filter((e) => 'FEDEX_2_DAY_FREIGHT' in e),
    ).toHaveLength(2)
    expect(fedex.services?.filter((s) => s.code === 'FEDEX_2_DAY_FREIGHT')).toEqual([
      { code: 'FEDEX_2_DAY_FREIGHT', name: '2 Day Freight' },
    ])
  })

  it('claims nothing the services map does not say', () => {
    const fedex = CarrierSchema.parse(carriers[0])
    expect(fedex.isActive).toBeUndefined()
    expect(fedex.createdAt).toBeUndefined()
    expect(fedex.updatedAt).toBeUndefined()
    expect(fedex.trackingUrlTemplate).toBeUndefined()
  })

  it('returns no carriers when `services` is absent', () => {
    expect(transformServicesMap({})).toEqual([])
  })
})
