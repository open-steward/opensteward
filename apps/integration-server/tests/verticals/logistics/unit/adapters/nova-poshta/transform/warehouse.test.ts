import { describe, it, expect } from 'vitest'
import {
  transformWarehouse,
  type NovaPoshtaDivision,
} from '../../../../../../../src/verticals/logistics/adapters/nova-poshta/transform/warehouse'
import { WarehouseSchema } from '../../../../../../../src/verticals/logistics/schema/warehouse'

function makeWarehouse(overrides: Partial<NovaPoshtaDivision> = {}): NovaPoshtaDivision {
  return {
    id: 'div-001',
    number: 'WH-042',
    name: 'Nova Poshta Branch #42',
    shortName: 'NP #42',
    typeCode: 'Post',
    city: 'Kyiv',
    settlement: undefined,
    region: 'Kyiv Oblast',
    street: 'Khreschatyk St',
    streetNumber: '10',
    flat: undefined,
    postalCode: '01001',
    countryCode: 'UA',
    phone: '+380441234567',
    email: 'branch42@novaposhta.ua',
    isActive: true,
    timezone: 'Europe/Kyiv',
    scheduleDescription: 'Mon-Fri 09:00-19:00',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-02T08:00:00Z',
    ...overrides,
  }
}

describe('nova-poshta transformWarehouse', () => {
  it('maps id from raw.id', () => {
    expect(transformWarehouse(makeWarehouse()).id).toBe('div-001')
  })

  it('maps name from name field', () => {
    expect(transformWarehouse(makeWarehouse()).name).toBe('Nova Poshta Branch #42')
  })

  it('falls back name to shortName when name is absent', () => {
    expect(transformWarehouse(makeWarehouse({ name: null })).name).toBe('NP #42')
  })

  it('maps code from number', () => {
    expect(transformWarehouse(makeWarehouse()).code).toBe('WH-042')
  })

  it('maps isActive', () => {
    expect(transformWarehouse(makeWarehouse()).isActive).toBe(true)
  })

  it('maps timezone', () => {
    expect(transformWarehouse(makeWarehouse()).timezone).toBe('Europe/Kyiv')
  })

  it('maps address.city from city field', () => {
    expect(transformWarehouse(makeWarehouse()).address?.city).toBe('Kyiv')
  })

  it('falls back address.city to settlement when city is absent', () => {
    const result = transformWarehouse(makeWarehouse({ city: null, settlement: 'Boryspil' }))
    expect(result.address?.city).toBe('Boryspil')
  })

  it('maps address.state from region', () => {
    expect(transformWarehouse(makeWarehouse()).address?.state).toBe('Kyiv Oblast')
  })

  it('concatenates street and streetNumber into address.street1', () => {
    expect(transformWarehouse(makeWarehouse()).address?.street1).toBe('Khreschatyk St 10')
  })

  it('omits address.street1 when street is absent', () => {
    expect(transformWarehouse(makeWarehouse({ street: null })).address?.street1).toBeUndefined()
  })

  it('maps address.street2 as "Apt <flat>" when flat is present', () => {
    expect(transformWarehouse(makeWarehouse({ flat: '3A' })).address?.street2).toBe('Apt 3A')
  })

  it('omits address.street2 when flat is absent', () => {
    expect(transformWarehouse(makeWarehouse({ flat: null })).address?.street2).toBeUndefined()
  })

  it('maps address.postalCode', () => {
    expect(transformWarehouse(makeWarehouse()).address?.postalCode).toBe('01001')
  })

  it('maps address.country from countryCode', () => {
    expect(transformWarehouse(makeWarehouse()).address?.country).toBe('UA')
  })

  it('maps address.phone', () => {
    expect(transformWarehouse(makeWarehouse()).address?.phone).toBe('+380441234567')
  })

  it('maps address.email', () => {
    expect(transformWarehouse(makeWarehouse()).address?.email).toBe('branch42@novaposhta.ua')
  })

  it('maps createdAt as Date', () => {
    expect(transformWarehouse(makeWarehouse()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt as Date', () => {
    expect(transformWarehouse(makeWarehouse()).updatedAt).toBeInstanceOf(Date)
  })

  it('passes WarehouseSchema.parse without throwing', () => {
    expect(() => WarehouseSchema.parse(transformWarehouse(makeWarehouse()))).not.toThrow()
  })
})
