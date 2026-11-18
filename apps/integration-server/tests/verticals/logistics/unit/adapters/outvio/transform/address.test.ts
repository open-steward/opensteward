import { describe, it, expect } from 'vitest'
import {
  transformAddress,
  type OutvioAddress,
} from '../../../../../../../src/verticals/logistics/adapters/outvio/transform/address'

// No dedicated address schema — tested via field mapping directly.

describe('transformAddress', () => {
  it('maps all canonical fields from OutvioAddress', () => {
    const raw: OutvioAddress = {
      name: 'Jane Doe',
      company: 'Acme Corp',
      address1: '123 Main St',
      address2: 'Suite 4',
      city: 'Madrid',
      province: 'Community of Madrid',
      zip: '28001',
      country: 'ES',
      phone: '+34600000001',
      email: 'jane@example.com',
    }
    const result = transformAddress(raw)

    expect(result?.name).toBe('Jane Doe')
    expect(result?.company).toBe('Acme Corp')
    expect(result?.street1).toBe('123 Main St')
    expect(result?.street2).toBe('Suite 4')
    expect(result?.city).toBe('Madrid')
    expect(result?.state).toBe('Community of Madrid')
    expect(result?.postalCode).toBe('28001')
    expect(result?.country).toBe('ES')
    expect(result?.phone).toBe('+34600000001')
    expect(result?.email).toBe('jane@example.com')
  })

  it('maps address1 to street1 and province to state', () => {
    const raw: OutvioAddress = { address1: '456 Elm St', province: 'Andalusia' }
    const result = transformAddress(raw)
    expect(result?.street1).toBe('456 Elm St')
    expect(result?.state).toBe('Andalusia')
  })

  it('returns undefined for null input', () => {
    expect(transformAddress(null)).toBeUndefined()
  })

  it('returns undefined for undefined input', () => {
    expect(transformAddress(undefined)).toBeUndefined()
  })

  it('returns undefined when all fields are null', () => {
    const raw: OutvioAddress = {
      name: null,
      company: null,
      address1: null,
      address2: null,
      city: null,
      province: null,
      zip: null,
      country: null,
      phone: null,
      email: null,
    }
    expect(transformAddress(raw)).toBeUndefined()
  })

  it('returns undefined for an empty object', () => {
    expect(transformAddress({})).toBeUndefined()
  })

  it('maps partial fields — only city and country provided', () => {
    const raw: OutvioAddress = { city: 'Barcelona', country: 'ES' }
    const result = transformAddress(raw)
    expect(result?.city).toBe('Barcelona')
    expect(result?.country).toBe('ES')
    expect(result?.name).toBeUndefined()
    expect(result?.street1).toBeUndefined()
  })
})
