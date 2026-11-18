/**
 * MX users as canonical customers.
 *
 * Fixture fields and examples are UserResponse's, from
 * https://docs.mx.com/openapi/platform-api/v20250224.yaml
 * (components.schemas.UserResponse): `email` ("example@example.com"), `guid`
 * ("USR-d74cb14f-fd0a-449f-991b-e0362a63d9c6"), `id` ("My-Unique-ID"),
 * `is_disabled` (false) and `metadata`, a string. UserResponse has no name and
 * no timestamps.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawMxUser,
} from '../../../../../../../src/verticals/payments/adapters/mx/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

const DOCUMENTED_USER: RawMxUser = {
  email: 'example@example.com',
  guid: 'USR-d74cb14f-fd0a-449f-991b-e0362a63d9c6',
  id: 'My-Unique-ID',
  is_disabled: false,
  metadata: '{"first_name": "Steven", "last_name": "Universe"}',
}

describe('mx transformCustomer', () => {
  it('maps the documented UserResponse example', () => {
    const result = CustomerSchema.parse(transformCustomer(DOCUMENTED_USER))
    expect(result.id).toBe('USR-d74cb14f-fd0a-449f-991b-e0362a63d9c6')
    expect(result.externalId).toBe('USR-d74cb14f-fd0a-449f-991b-e0362a63d9c6')
    expect(result.email).toBe('example@example.com')
    expect(result.gateway).toBe('mx')
    expect(result.raw).toEqual(DOCUMENTED_USER)
  })

  it('invents no name, timestamps or metadata keys UserResponse does not have', () => {
    const result = CustomerSchema.parse(transformCustomer(DOCUMENTED_USER))
    expect(result.name).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
    // `metadata` is a free-form string, not a map.
    expect(result.metadata).toEqual({})
  })

  it('leaves email absent when the user has none', () => {
    const result = CustomerSchema.parse(
      transformCustomer({ guid: 'USR-1', email: null, id: null, metadata: null }),
    )
    expect(result.email).toBeUndefined()
  })

  it('throws instead of writing an empty id when guid is null', () => {
    expect(() => transformCustomer({ guid: null, email: 'a@b.example' })).toThrow(/guid/)
  })
})
