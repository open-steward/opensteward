import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type RawSysaidEndUser,
} from '../../../../../../../src/verticals/customer-support/adapters/sysaid/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema/contact'

describe('sysaid transformContact', () => {
  it('maps a fully-populated end-user with displayName', () => {
    const raw: RawSysaidEndUser = {
      id: 101,
      userEmail: 'jane@example.com',
      userName: 'jdoe',
      firstName: 'Jane',
      lastName: 'Doe',
      displayName: 'Jane Doe',
      workPhone: '+14155550100',
      mobile: '+14155550200',
      companyId: 7,
      isDisabled: false,
    }

    const result = transformContact(raw)

    // id maps from raw.id
    expect(result.id).toBe('101')
    expect(result.externalId).toBe('101')
    // email maps from userEmail
    expect(result.email).toBe('jane@example.com')
    // name maps from displayName (preferred over joined firstName+lastName)
    expect(result.name).toBe('Jane Doe')
    // phone: mobile preferred over workPhone
    expect(result.phone).toBe('+14155550200')
    // organizationId from companyId
    expect(result.organizationId).toBe('7')
    // platform
    expect(result.platform).toBe('sysaid')

    expect(() => ContactSchema.parse(result)).not.toThrow()
  })

  it('falls back to joined first+last name when displayName absent', () => {
    const raw: RawSysaidEndUser = {
      id: 202,
      userEmail: 'bob@example.com',
      firstName: 'Bob',
      lastName: 'Builder',
      workPhone: '+10000000000',
    }

    const result = transformContact(raw)

    // name built from firstName + lastName when displayName absent
    expect(result.name).toBe('Bob Builder')
    // phone from workPhone when mobile absent
    expect(result.phone).toBe('+10000000000')

    expect(() => ContactSchema.parse(result)).not.toThrow()
  })

  it('falls back to userName when name parts all absent', () => {
    const raw: RawSysaidEndUser = {
      id: 303,
      userEmail: 'user@example.com',
      userName: 'jsmith',
    }

    const result = transformContact(raw)

    expect(result.name).toBe('jsmith')
    expect(result.phone).toBeUndefined()
    expect(result.organizationId).toBeUndefined()

    expect(() => ContactSchema.parse(result)).not.toThrow()
  })

  it('handles completely empty input', () => {
    const raw: RawSysaidEndUser = {}

    const result = transformContact(raw)

    expect(result.id).toBe('')
    expect(result.name).toBe('')
    expect(result.email).toBeUndefined()

    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
