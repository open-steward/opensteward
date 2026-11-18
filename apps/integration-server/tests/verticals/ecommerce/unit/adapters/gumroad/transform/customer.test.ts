import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawGumroadSubscriber,
} from '../../../../../../../src/verticals/ecommerce/adapters/gumroad/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeSubscriber(overrides: Partial<RawGumroadSubscriber> = {}): RawGumroadSubscriber {
  return {
    id: 'sub-001',
    email: 'subscriber@example.com',
    status: 'alive',
    product_id: 'abc123',
    product_name: 'Ultimate Guide to TypeScript',
    user_id: 'user-42',
    user_email: 'subscriber@example.com',
    created_at: '2024-03-15T08:00:00Z',
    ended_at: null,
    charge_occurrence_count: 3,
    ...overrides,
  }
}

describe('transformCustomer (Gumroad)', () => {
  it('maps core fields and uses subscriber id as canonical id', () => {
    const result = transformCustomer(makeSubscriber())
    expect(result.id).toBe('sub-001')
    expect(result.email).toBe('subscriber@example.com')
  })

  it('tags include status and product name', () => {
    const result = transformCustomer(makeSubscriber())
    expect(result.tags).toContain('alive')
    expect(result.tags).toContain('product:Ultimate Guide to TypeScript')
  })

  it('maps timestamps', () => {
    const result = transformCustomer(makeSubscriber())
    expect(result.createdAt).toBe('2024-03-15T08:00:00Z')
  })

  it('produces a payload that satisfies CustomerSchema and preserves raw in metadata', () => {
    const raw = makeSubscriber()
    const result = transformCustomer(raw)
    expect(() => CustomerSchema.parse(result)).not.toThrow()
    expect(result.metadata['id']).toBe('sub-001')
    expect(result.metadata['product_id']).toBe('abc123')
  })

  it('falls back to user_email when email is missing', () => {
    const result = transformCustomer(makeSubscriber({ email: undefined, user_email: 'fallback@example.com' }))
    expect(result.email).toBe('fallback@example.com')
  })

  it('handles dead subscriptions', () => {
    const result = transformCustomer(makeSubscriber({
      status: 'dead',
      ended_at: '2024-06-01T00:00:00Z',
    }))
    expect(result.tags).toContain('dead')
  })

  it('handles missing optional fields gracefully', () => {
    const minimal: RawGumroadSubscriber = {
      id: 'sub-minimal',
    }
    const result = transformCustomer(minimal)
    expect(result.id).toBe('sub-minimal')
    expect(result.email).toBeUndefined()
    expect(result.tags).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
  })
})
