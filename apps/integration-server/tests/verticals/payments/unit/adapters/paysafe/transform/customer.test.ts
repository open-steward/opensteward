import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawPaysafeProfile,
} from '../../../../../../../src/verticals/payments/adapters/paysafe/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('paysafe transformCustomer', () => {
  it('maps a full customer vault profile', () => {
    const raw: RawPaysafeProfile = {
      id: 'prof_001',
      merchantCustomerId: 'MCU-001',
      firstName: 'Jane',
      middleName: 'A',
      lastName: 'Doe',
      email: 'jane@example.com',
      phone: '+14155550123',
      status: 'ACTIVE',
      creationDate: '2024-03-01T00:00:00Z',
      lastModified: '2024-03-01T00:00:00Z',
    }

    const result = transformCustomer(raw)

    expect(result.id).toBe('prof_001')
    expect(result.externalId).toBe('prof_001')
    expect(result.name).toBe('Jane A Doe')
    expect(result.email).toBe('jane@example.com')
    expect(result.phone).toBe('+14155550123')
    expect(result.gateway).toBe('paysafe')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('joins first and last name without middle name', () => {
    const raw: RawPaysafeProfile = {
      id: 'prof_002',
      firstName: 'Bob',
      lastName: 'Smith',
      email: 'bob@example.com',
      creationDate: '2024-03-01T00:00:00Z',
    }

    const result = transformCustomer(raw)

    expect(result.name).toBe('Bob Smith')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('falls back to merchantCustomerId when id is missing', () => {
    const raw: RawPaysafeProfile = {
      merchantCustomerId: 'MCU-FALLBACK',
      firstName: 'Alice',
      creationDate: '2024-03-01T00:00:00Z',
    }

    const result = transformCustomer(raw)

    expect(result.id).toBe('MCU-FALLBACK')
    expect(result.name).toBe('Alice')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('prefers cellPhone when phone is absent', () => {
    const raw: RawPaysafeProfile = {
      id: 'prof_003',
      cellPhone: '+442071234567',
      creationDate: '2024-03-01T00:00:00Z',
    }

    const result = transformCustomer(raw)

    expect(result.phone).toBe('+442071234567')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
