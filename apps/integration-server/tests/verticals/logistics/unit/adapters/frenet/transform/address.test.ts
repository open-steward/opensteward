import { describe, it, expect } from 'vitest'
import {
  transformAddress,
  type FrenetAddress,
} from '../../../../../../../src/verticals/logistics/adapters/frenet/transform/address'
import { AddressSchema } from '../../../../../../../src/verticals/logistics/schema/shared'

function makeAddress(overrides: Partial<FrenetAddress> = {}): FrenetAddress {
  return {
    Addressee: 'João Silva',
    Street: 'Rua das Flores',
    Number: '100',
    Complement: 'Apto 3B',
    Neighborhood: 'Centro',
    City: 'São Paulo',
    UF: 'SP',
    CEP: '01310-100',
    Country: 'BR',
    Phone: '+5511999990000',
    Email: 'joao@example.com',
    ...overrides,
  }
}

describe('frenet transformAddress', () => {
  it('returns undefined for null input', () => {
    expect(transformAddress(null)).toBeUndefined()
    expect(transformAddress(undefined)).toBeUndefined()
  })

  it('maps Addressee as name', () => {
    expect(transformAddress(makeAddress())?.name).toBe('João Silva')
  })

  it('maps City as city', () => {
    expect(transformAddress(makeAddress())?.city).toBe('São Paulo')
  })

  it('maps UF as state', () => {
    expect(transformAddress(makeAddress())?.state).toBe('SP')
  })

  it('maps CEP as postalCode', () => {
    expect(transformAddress(makeAddress())?.postalCode).toBe('01310-100')
  })

  it('defaults country to BR when Country is null', () => {
    expect(transformAddress(makeAddress({ Country: null }))?.country).toBe('BR')
  })

  it('concatenates Street, Number, Complement, Neighborhood into street1', () => {
    const result = transformAddress(makeAddress())
    expect(result?.street1).toBe('Rua das Flores, 100, Apto 3B, Centro')
  })

  it('maps Phone and Email', () => {
    const result = transformAddress(makeAddress())
    expect(result?.phone).toBe('+5511999990000')
    expect(result?.email).toBe('joao@example.com')
  })

  it('omits missing optional parts from street1', () => {
    const result = transformAddress(makeAddress({ Complement: null, Neighborhood: null }))
    expect(result?.street1).toBe('Rua das Flores, 100')
  })

  it('passes AddressSchema validation', () => {
    // Note: email must be valid email format; country must be ISO 3166-alpha-2
    expect(() => AddressSchema.parse(transformAddress(makeAddress()))).not.toThrow()
  })
})
