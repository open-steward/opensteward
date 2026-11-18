/**
 * Fixture: the documented example response of
 * `GET https://secure-wms.com/properties/facilities` ("Facilities") in the
 * 3PL Central REST APIs Postman collection,
 * https://developer.3plcentral.com/api/collections/8399762/SVn3tFsv, verbatim.
 * Its string values are the placeholder "str".
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'
import {
  transformWarehouse,
  facilityRows,
  type ExtensivFacilitiesResponse,
} from '../../../../../../../src/verticals/logistics/adapters/extensiv/transform/warehouse'

const res = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/facilities.json'), 'utf8'),
) as ExtensivFacilitiesResponse

describe('Extensiv transformWarehouse (documented GET /properties/facilities)', () => {
  const rows = facilityRows(res)

  it('reads the facilities embedded under the documented HAL rel', () => {
    expect(rows).toHaveLength(1)
  })

  it('parses the documented example with the canonical schema', () => {
    const w = WarehouseSchema.parse(transformWarehouse(rows[0]))
    expect(w.id).toBe('1')
    expect(w.name).toBe('str')
    expect(w.code).toBe('str')
    expect(w.isActive).toBe(false)
  })

  it('maps the contact to the address, without the undocumented-format country', () => {
    const w = WarehouseSchema.parse(transformWarehouse(rows[0]))
    expect(w.address).toEqual({
      name: 'str',
      company: 'str',
      street1: 'str',
      street2: 'str',
      city: 'str',
      state: 'str',
      postalCode: 'str',
      phone: 'str',
    })
  })

  it('keeps a well-formed emailAddress and omits timeZoneName (not documented as IANA)', () => {
    const w = WarehouseSchema.parse(
      transformWarehouse({
        ...rows[0],
        deactivated: false,
        contact: { ...rows[0].contact, emailAddress: 'dock@example.com' },
      }),
    )
    expect(w.address?.email).toBe('dock@example.com')
    expect(w.isActive).toBe(true)
    expect(w.timezone).toBeUndefined()
    expect(w.metadata?.timeZoneName).toBe('str')
  })

  it('returns no rows for a response with nothing embedded', () => {
    expect(facilityRows({ totalResults: 0 })).toEqual([])
  })
})
