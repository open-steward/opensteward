/**
 * Fixture: an excerpt of the documented example response of
 * `GET https://secure-wms.com/properties/carriers` ("Carriers, services, and
 * billing options") in the 3PL Central REST APIs Postman collection,
 * https://developer.3plcentral.com/api/collections/8399762/SVn3tFsv. Carriers
 * FedEx (first three services), CUST, Canada Post and Asendia, verbatim.
 */
import { describe, it, expect } from 'vitest'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'
import {
  transformCarriers,
  transformCarrier,
  type ExtensivCarriersResponse,
} from '../../../../../../../src/verticals/logistics/adapters/extensiv/transform/carrier'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const res = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/carriers.json'), 'utf8'),
) as ExtensivCarriersResponse

describe('Extensiv transformCarriers (documented GET /properties/carriers)', () => {
  const carriers = transformCarriers(res)

  it('parses every embedded carrier with the canonical schema', () => {
    expect(carriers).toHaveLength(4)
    for (const c of carriers) CarrierSchema.parse(c)
  })

  it('keys each carrier by its name and shows the description as its name', () => {
    const fedex = CarrierSchema.parse(carriers.find((c) => c.id === 'FedEx'))
    expect(fedex.name).toBe('Federal Express')
    expect(fedex.code).toBe('FDEG')
    expect(fedex.isActive).toBe(true)
  })

  it("maps a carrier's own shipmentServices (code, description)", () => {
    const fedex = CarrierSchema.parse(carriers.find((c) => c.id === 'FedEx'))
    expect(fedex.services?.map((s) => s.code)).toEqual(['327', '328', '329'])
    expect(fedex.services?.[0].name).toBe('First Overnight One Rate')
  })

  it('uses defaultShipmentServices for a carrier whose own list is empty, as the docs say', () => {
    const cust = CarrierSchema.parse(carriers.find((c) => c.id === 'CUST'))
    expect(cust.name).toBe('Custom Freight')
    expect(cust.services?.map((s) => s.code)).toEqual(
      (res.defaultShipmentServices ?? []).map((s) => s.code),
    )
  })

  it('omits code when scacCode is absent or empty', () => {
    expect(carriers.find((c) => c.id === 'Canada Post')?.code).toBeUndefined()
    expect(carriers.find((c) => c.id === 'Asendia')?.code).toBeUndefined()
  })

  it('maps deactivated to isActive', () => {
    const c = CarrierSchema.parse(transformCarrier({ name: 'X', deactivated: true }))
    expect(c.isActive).toBe(false)
  })

  it('returns [] for a response with no embedded carriers', () => {
    expect(transformCarriers({})).toEqual([])
  })
})
