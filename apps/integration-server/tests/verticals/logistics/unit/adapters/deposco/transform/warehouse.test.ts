/**
 * Fixture: the item of the documented 200 example of GET /facilities
 * (https://auth.deposco.com/public/spec?version=latest).
 */
import { describe, it, expect } from 'vitest'
import {
  transformWarehouse,
  type DeposcoFacility,
} from '../../../../../../../src/verticals/logistics/adapters/deposco/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

const DOCUMENTED_FACILITY: DeposcoFacility = {
  self: {
    id: 1,
    businessKey: { number: 'Atlanta1', 'businessUnit.code': 'ABC' },
    href: 'https://api.deposco.com/latest/facilities/1',
  },
  businessUnit: {
    id: 73,
    businessKey: { code: 'SANDBOX_3PL' },
    href: 'https://api.deposco.com/latest/companies/73',
  },
  number: 'Atlanta1',
  name: 'Atlanta Main',
  type: 'Distribution Center',
  description: 'HQ DC',
  phone: '123-456-7890',
  contact: { name: 'John Doe', phone: '123-456-7890' },
  address: { line1: '123 Test Rd', city: 'Atlanta', postalCode: '30308' },
  dbaName: 'ACME',
  squareFeet: 5000,
  timeZone: 'US/Eastern',
  isVirtual: false,
  enableShipToCustomer: true,
  enableCustomerPickup: false,
  latitude: 34.03445,
  longitude: -84.27476,
  facilityUOMSystem: 'Imperial',
  createdDate: '2024-05-30T10:09:07-05:00',
  updatedDate: '2024-05-30T10:09:49.462-05:00',
}

describe('deposco transformWarehouse (documented example)', () => {
  const out = transformWarehouse(DOCUMENTED_FACILITY)

  it('parses with the canonical WarehouseSchema', () => {
    expect(() => WarehouseSchema.parse(out)).not.toThrow()
  })

  it('takes the id from self.id, the {facilityId} of GET /facilities/{facilityId}', () => {
    expect(out.id).toBe('1')
  })

  it('maps number, name, address, phone and time zone', () => {
    expect(out.code).toBe('Atlanta1')
    expect(out.name).toBe('Atlanta Main')
    expect(out.address).toEqual({
      street1: '123 Test Rd',
      city: 'Atlanta',
      postalCode: '30308',
      phone: '123-456-7890',
    })
    expect(out.timezone).toBe('US/Eastern')
  })

  it('maps dates', () => {
    expect(out.createdAt?.toISOString()).toBe('2024-05-30T15:09:07.000Z')
    expect(out.updatedAt?.toISOString()).toBe('2024-05-30T15:09:49.462Z')
  })

  it('invents no active flag or cut-off time', () => {
    expect(out.isActive).toBeUndefined()
    expect(out.cutoffTime).toBeUndefined()
  })
})
