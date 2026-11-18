import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawXenditCustomer,
} from '../../../../../../../src/verticals/payments/adapters/xendit/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('xendit transformCustomer', () => {
  it('derives name from individual_detail given_names + surname', () => {
    const raw: RawXenditCustomer = {
      id: 'cust-001',
      reference_id: 'ref-001',
      type: 'INDIVIDUAL',
      email: 'jane@example.com',
      mobile_number: '+628123456789',
      individual_detail: {
        given_names: 'Jane',
        surname: 'Doe',
      },
      created: '2024-03-01T00:00:00Z',
      updated: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.name).toBe('Jane Doe')
    expect(result.email).toBe('jane@example.com')
    expect(result.phone).toBe('+628123456789')
    expect(result.gateway).toBe('xendit')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('prefers business_detail.business_name over individual name fields', () => {
    const raw: RawXenditCustomer = {
      id: 'cust-002',
      type: 'BUSINESS',
      business_detail: { business_name: 'Acme Corp' },
      given_names: 'John',
      surname: 'Smith',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.name).toBe('Acme Corp')
    expect(result.gateway).toBe('xendit')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('falls back to top-level given_names/surname when no detail blocks', () => {
    const raw: RawXenditCustomer = {
      id: 'cust-003',
      given_names: 'Ali',
      surname: 'Baba',
      email: 'ali@example.com',
      created: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.name).toBe('Ali Baba')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
