import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type RawJitbitUser,
} from '../../../../../../../src/verticals/customer-support/adapters/jitbit-helpdesk/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema/contact'

describe('jitbit-helpdesk transformContact', () => {
  it('concatenates FirstName and LastName', () => {
    const raw: RawJitbitUser = { UserID: 1, FirstName: 'Jane', LastName: 'Doe' }
    const result = transformContact(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('falls back to Username when name parts are absent', () => {
    const raw: RawJitbitUser = { UserID: 2, Username: 'janedoe' }
    const result = transformContact(raw)
    expect(result.name).toBe('janedoe')
  })

  it('maps Email to email', () => {
    const raw: RawJitbitUser = { UserID: 3, Email: 'jane@example.com' }
    const result = transformContact(raw)
    expect(result.email).toBe('jane@example.com')
  })

  it('maps Phone to phone', () => {
    const raw: RawJitbitUser = { UserID: 4, Phone: '+14155550123' }
    const result = transformContact(raw)
    expect(result.phone).toBe('+14155550123')
  })

  it('maps CompanyId to organizationId as string', () => {
    const raw: RawJitbitUser = { UserID: 5, CompanyId: 77 }
    const result = transformContact(raw)
    expect(result.organizationId).toBe('77')
  })

  it('sets id and externalId from UserID', () => {
    const raw: RawJitbitUser = { UserID: 42, FirstName: 'Test' }
    const result = transformContact(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('sets platform to jitbit-helpdesk', () => {
    const raw: RawJitbitUser = { UserID: 6 }
    const result = transformContact(raw)
    expect(result.platform).toBe('jitbit-helpdesk')
  })

  it('passes ContactSchema validation', () => {
    const raw: RawJitbitUser = {
      UserID: 99,
      FirstName: 'Valid',
      LastName: 'User',
      Email: 'valid@example.com',
      Phone: '+14155550100',
      CompanyId: 10,
    }
    const result = transformContact(raw)
    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
