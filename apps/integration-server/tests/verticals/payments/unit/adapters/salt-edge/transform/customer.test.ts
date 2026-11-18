import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawSaltEdgeCustomer,
} from '../../../../../../../src/verticals/payments/adapters/salt-edge/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

describe('salt-edge transformCustomer', () => {
  it('maps a full customer record correctly', () => {
    const raw: RawSaltEdgeCustomer = {
      id: 'cus-001',
      identifier: 'user-ref-001',
      secret: 'secret-token',
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-02T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus-001')
    expect(result.externalId).toBe('cus-001')
    expect(result.name).toBe('user-ref-001')
    expect(result.gateway).toBe('salt-edge')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles a blocked customer (no blocked_at causes no issues)', () => {
    const raw: RawSaltEdgeCustomer = {
      id: 'cus-002',
      identifier: 'blocked-user',
      blocked_at: '2024-02-01T00:00:00Z',
      created_at: '2024-01-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus-002')
    expect(result.name).toBe('blocked-user')
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })

  it('handles minimal customer with no identifier', () => {
    const raw: RawSaltEdgeCustomer = {
      id: 'cus-003',
      created_at: '2024-03-01T00:00:00Z',
    }
    const result = transformCustomer(raw)
    expect(result.id).toBe('cus-003')
    expect(result.name).toBeUndefined()
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
