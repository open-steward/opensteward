/**
 * Fixture shape verified against `gofynd/fdk-client-javascript` @ commit
 * `7598488bf04e7a75bc44088441745538d524abec`,
 * `sdk/platform/User/UserPlatformModel.js` — `UserSearchSchema()`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawFyndCustomer,
} from '../../../../../../../src/verticals/ecommerce/adapters/fynd/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/ecommerce/schema/customer'

function makeCustomer(overrides: Partial<RawFyndCustomer> = {}): RawFyndCustomer {
  return {
    _id: 'usr_abc123',
    first_name: 'Jane',
    last_name: 'Doe',
    emails: [{ email: 'jane.doe@example.com', primary: true }],
    phone_numbers: [{ phone: '9820012345', country_code: 91, primary: true }],
    created_at: '2026-01-15T09:30:00.000Z',
    updated_at: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('transformCustomer', () => {
  it('maps core fields', () => {
    const result = transformCustomer(makeCustomer())
    expect(result.id).toBe('usr_abc123')
    expect(result.firstName).toBe('Jane')
    expect(result.lastName).toBe('Doe')
    expect(result.email).toBe('jane.doe@example.com')
  })

  it('prefers the primary email/phone and prefixes the country code', () => {
    const result = transformCustomer(
      makeCustomer({
        emails: [
          { email: 'old@example.com', primary: false },
          { email: 'jane.doe@example.com', primary: true },
        ],
      }),
    )
    expect(result.email).toBe('jane.doe@example.com')
    expect(result.phone).toBe('+919820012345')
  })

  it('throws when _id is missing', () => {
    expect(() => transformCustomer({ ...makeCustomer(), _id: undefined as unknown as string })).toThrow(
      /_id/,
    )
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCustomer()
    expect(transformCustomer(raw).metadata).toBe(raw)
  })

  it('produces a payload that satisfies CustomerSchema', () => {
    const result = transformCustomer(makeCustomer())
    expect(() => CustomerSchema.parse(result)).not.toThrow()
  })
})
