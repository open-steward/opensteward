/**
 * Fixtures from the documented examples of List Individual Users
 * (https://docs.transfi.com/reference/list-individual-users.md) and List
 * Business Users (https://docs.transfi.com/reference/list-business-users.md).
 */
import { describe, it, expect } from 'vitest'
import {
  transformCustomer,
  type RawTransfiCustomer,
} from '../../../../../../../src/verticals/payments/adapters/transfi/transform/customer'
import { CustomerSchema } from '../../../../../../../src/verticals/payments/schema/customer'

const INDIVIDUAL: RawTransfiCustomer = {
  userId: 'UX-260224104251483547',
  type: 'individual',
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@example.com',
  country: 'IN',
  status: 'user_approved',
  timestamps: { userCreatedAt: '2026-02-24T10:42:52.442Z' },
}

const BUSINESS: RawTransfiCustomer = {
  userId: 'UX-260105073228440',
  type: 'business',
  name: 'Tech Solutions LLC',
  businessName: 'Tech Solutions LLC',
  firstName: 'Tech Solutions LLC',
  email: 'infod@techsolutions87.com',
  country: 'US',
  status: 'user_approved',
  timestamps: { userCreatedAt: '2026-01-05T07:32:29.713Z' },
}

describe('transfi transformCustomer', () => {
  it('maps an individual user', () => {
    const c = CustomerSchema.parse(transformCustomer(INDIVIDUAL))
    expect(c.id).toBe('UX-260224104251483547')
    expect(c.externalId).toBe('UX-260224104251483547')
    expect(c.name).toBe('John Doe')
    expect(c.email).toBe('john.doe@example.com')
    expect(c.createdAt).toBe('2026-02-24T10:42:52.442Z')
    expect(c.metadata).toEqual({ type: 'individual', status: 'user_approved' })
    expect(c.gateway).toBe('transfi')
  })

  it('maps a business user by businessName', () => {
    const c = CustomerSchema.parse(transformCustomer(BUSINESS))
    expect(c.id).toBe('UX-260105073228440')
    expect(c.name).toBe('Tech Solutions LLC')
    expect(c.metadata.type).toBe('business')
  })

  it('names a business user from businessName, not firstName', () => {
    // The documented example repeats the business name in firstName, which
    // cannot tell the two apart; drop firstName so only businessName can name it.
    const { firstName: _firstName, ...noFirstName } = BUSINESS
    expect(CustomerSchema.parse(transformCustomer(noFirstName)).name).toBe('Tech Solutions LLC')
  })

  it('refuses a user with no userId', () => {
    expect(() => transformCustomer({ ...INDIVIDUAL, userId: undefined })).toThrow(/userId/)
  })
})
