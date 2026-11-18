import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawBelvoOwner,
} from '../../../../../../../src/verticals/payments/adapters/belvo/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('belvo transformCustomer', () => {
  it('maps a full owner record to a canonical Customer', () => {
    const raw: RawBelvoOwner = {
      id: 'owner-001',
      link: 'link-abc',
      display_name: 'Maria Garcia',
      first_name: 'Maria',
      last_name: 'Garcia',
      email: 'maria@example.com',
      phone_number: '+5255123456',
      address: 'Calle Reforma 100, CDMX',
      collected_at: '2024-03-01T00:00:00Z',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('owner-001')
    expect(result.email).toBe('maria@example.com')
    expect(result.name).toBe('Maria Garcia')
    expect(result.phone).toBe('+5255123456')
    expect(result.gateway).toBe('belvo')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('constructs name from first_name + last_name when display_name is absent', () => {
    const raw: RawBelvoOwner = {
      id: 'owner-002',
      first_name: 'Juan',
      last_name: 'Lopez',
      second_last_name: 'Martinez',
      email: 'juan@example.com',
    }
    const result = transformCustomer(raw)
    expect(result.name).toBe('Juan Lopez Martinez')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('sets createdAt from collected_at', () => {
    const raw: RawBelvoOwner = {
      id: 'owner-003',
      collected_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.createdAt).toBeTruthy()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles minimal owner with only an id', () => {
    const raw: RawBelvoOwner = {
      id: 'owner-004',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('owner-004')
    expect(result.email).toBeUndefined()
    expect(result.name).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
