import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  untransformCustomer,
  type RawEverShopCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/evershop/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawEverShopCustomer> = {}): RawEverShopCustomer {
  return {
    customer_id: 55,
    uuid: 'cust-uuid-evershop-1',
    email: 'carlos@example.com',
    full_name: 'Carlos Mendoza',
    status: 1,
    group_id: 2,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformCustomer (EverShop)', () => {
  it('uses uuid as id when available', () => {
    const result = transformCustomer(makeCustomer({ uuid: 'cust-uuid-evershop-1' }))
    expect(result.id).toBe('cust-uuid-evershop-1')
  })

  it('falls back to string customer_id when uuid is absent', () => {
    const result = transformCustomer(makeCustomer({ uuid: undefined }))
    expect(result.id).toBe('55')
  })

  it('falls back to email when both uuid and customer_id are absent', () => {
    const result = transformCustomer(makeCustomer({ uuid: undefined, customer_id: undefined }))
    expect(result.id).toBe('carlos@example.com')
  })

  it('maps email', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.email).toBe('carlos@example.com')
  })

  it('splits full_name into firstName and lastName', () => {
    const result = transformCustomer(makeCustomer({ full_name: 'Carlos Mendoza' }))
    expect(result.firstName).toBe('Carlos')
    expect(result.lastName).toBe('Mendoza')
  })

  it('handles single-word name as firstName only', () => {
    const result = transformCustomer(makeCustomer({ full_name: 'Zendaya' }))
    expect(result.firstName).toBe('Zendaya')
    expect(result.lastName).toBeUndefined()
  })

  it('handles multi-word last name', () => {
    const result = transformCustomer(makeCustomer({ full_name: 'Gabriel García Márquez' }))
    expect(result.firstName).toBe('Gabriel')
    expect(result.lastName).toBe('García Márquez')
  })

  it('handles missing full_name gracefully', () => {
    const result = transformCustomer(makeCustomer({ full_name: null }))
    expect(result.firstName).toBeUndefined()
    expect(result.lastName).toBeUndefined()
  })

  it('maps timestamps', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.createdAt).toBeDefined()
    expect(result.updatedAt).toBeDefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCustomer()
    const result = transformCustomer(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})

describe('untransformCustomer (EverShop)', () => {
  it('maps email', () => {
    const body = untransformCustomer({ email: 'test@example.com' })
    expect(body['email']).toBe('test@example.com')
  })

  it('joins firstName and lastName into full_name', () => {
    const body = untransformCustomer({ firstName: 'Carlos', lastName: 'Mendoza' })
    expect(body['full_name']).toBe('Carlos Mendoza')
  })

  it('uses only firstName when lastName is absent', () => {
    const body = untransformCustomer({ firstName: 'Zendaya' })
    expect(body['full_name']).toBe('Zendaya')
  })

  it('sets status to 1', () => {
    const body = untransformCustomer({ email: 'test@example.com' })
    expect(body['status']).toBe(1)
  })
})
