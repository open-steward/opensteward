import { describe, it, expect } from 'vitest'
import {
  transformWarehouse,
  type ElogiiDepot,
} from '../../../../../../../src/verticals/logistics/adapters/elogii/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

function makeDepot(o: Partial<ElogiiDepot> = {}): ElogiiDepot {
  return {
    _id: 'depot-001',
    name: 'West Coast Depot',
    address: {
      street: '100 Warehouse Blvd',
      city: 'Oakland',
      state: 'CA',
      country: 'US',
      postcode: '94601',
    },
    phone: '+15101234567',
    email: 'depot@example.com',
    isActive: true,
    timezone: 'America/Los_Angeles',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T12:00:00Z',
    ...o,
  }
}

describe('elogii transformWarehouse', () => {
  it('maps _id to id', () => {
    expect(transformWarehouse(makeDepot()).id).toBe('depot-001')
  })

  it('maps name', () => {
    expect(transformWarehouse(makeDepot()).name).toBe('West Coast Depot')
  })

  it('maps address street', () => {
    expect(transformWarehouse(makeDepot()).address?.street1).toBe('100 Warehouse Blvd')
  })

  it('maps address city', () => {
    expect(transformWarehouse(makeDepot()).address?.city).toBe('Oakland')
  })

  it('maps address state', () => {
    expect(transformWarehouse(makeDepot()).address?.state).toBe('CA')
  })

  it('maps address country', () => {
    expect(transformWarehouse(makeDepot()).address?.country).toBe('US')
  })

  it('maps address postalCode from postcode', () => {
    expect(transformWarehouse(makeDepot()).address?.postalCode).toBe('94601')
  })

  it('falls back to zip_code when postcode absent', () => {
    const result = transformWarehouse(
      makeDepot({ address: { ...makeDepot().address!, postcode: null, zip_code: '94602' } }),
    )
    expect(result.address?.postalCode).toBe('94602')
  })

  it('maps phone to address phone', () => {
    expect(transformWarehouse(makeDepot()).address?.phone).toBe('+15101234567')
  })

  it('maps email to address email', () => {
    expect(transformWarehouse(makeDepot()).address?.email).toBe('depot@example.com')
  })

  it('maps isActive', () => {
    expect(transformWarehouse(makeDepot()).isActive).toBe(true)
  })

  it('maps timezone', () => {
    expect(transformWarehouse(makeDepot()).timezone).toBe('America/Los_Angeles')
  })

  it('parses createdAt as Date', () => {
    expect(transformWarehouse(makeDepot()).createdAt).toBeInstanceOf(Date)
  })

  it('parses updatedAt as Date', () => {
    expect(transformWarehouse(makeDepot()).updatedAt).toBeInstanceOf(Date)
  })

  it('passes WarehouseSchema validation', () => {
    const result = transformWarehouse(makeDepot())
    expect(() => WarehouseSchema.parse(result)).not.toThrow()
  })

  it('metadata is the raw depot', () => {
    const raw = makeDepot()
    expect(transformWarehouse(raw).metadata).toBe(raw)
  })
})
