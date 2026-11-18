/**
 * Endicia (SERA) carrier transform.
 *
 * The fixture follows the documented 200 response of GET /v1/carrier-services
 * (https://developer.stamps.com/rest-api/reference/serav1.html): an object
 * with `shipping_options[]`, each `{ carrier, services[] }`, each service
 * `{ service_type, service_name, packaging_options[] }`. The reference gives a
 * schema but no example body, so the values below are illustrative; the field
 * names and nesting are the documented ones. `usps_ground_advantage` is the
 * service_type the reference's "What's New" section names.
 */
import { describe, it, expect } from 'vitest'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'
import {
  transformCarrier,
  type EndiciaCarrierShippingOption,
} from '../../../../../../../src/verticals/logistics/adapters/endicia/transform/carrier'

function uspsOption(): EndiciaCarrierShippingOption {
  return {
    carrier: 'usps',
    services: [
      {
        service_type: 'usps_ground_advantage',
        service_name: 'USPS Ground Advantage',
        packaging_options: [
          {
            packaging_type: 'package',
            packaging_name: 'Package',
            content_options: [],
          },
        ],
      },
      { service_type: 'usps_priority_mail', service_name: 'USPS Priority Mail' },
    ],
  }
}

describe('Endicia transformCarrier', () => {
  it('maps a documented shipping option to a schema-valid carrier', () => {
    const result = CarrierSchema.parse(transformCarrier(uspsOption()))
    expect(result.id).toBe('usps')
    expect(result.code).toBe('usps')
    expect(result.services).toEqual([
      { code: 'usps_ground_advantage', name: 'USPS Ground Advantage' },
      { code: 'usps_priority_mail', name: 'USPS Priority Mail' },
    ])
  })

  it('invents no display name and no active flag the docs do not give', () => {
    const result = transformCarrier(uspsOption())
    expect(result.name).toBeUndefined()
    expect(result.isActive).toBeUndefined()
  })

  it('keeps the raw option as metadata', () => {
    const raw = uspsOption()
    expect(transformCarrier(raw).metadata).toBe(raw)
  })

  it('omits a service name SERA did not send', () => {
    const result = CarrierSchema.parse(
      transformCarrier({ carrier: 'ups', services: [{ service_type: 'ups_ground' }] }),
    )
    expect(result.services).toEqual([{ code: 'ups_ground' }])
  })

  it('throws rather than inventing an id for an option with no carrier', () => {
    expect(() => transformCarrier({ services: [] })).toThrow(/no carrier/)
  })

  it('throws rather than inventing a service code for a service with no service_type', () => {
    expect(() =>
      transformCarrier({ carrier: 'usps', services: [{ service_name: 'Mystery' }] }),
    ).toThrow(/no service_type/)
  })
})
