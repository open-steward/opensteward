import { describe, it, expect } from 'vitest'
import {
  transformContact,
  type RawVivantioCaller,
} from '../../../../../../../src/verticals/customer-support/adapters/vivantio/transform/contact'
import { ContactSchema } from '../../../../../../../src/verticals/customer-support/schema/contact'

describe('vivantio transformContact', () => {
  it('maps a fully-populated caller with Name display field', () => {
    const raw: RawVivantioCaller = {
      Id: 200,
      Name: 'Jane Doe',
      FirstName: 'Jane',
      LastName: 'Doe',
      Email: 'jane@example.com',
      Phone: '+14155550123',
      ClientId: 7,
      ClientName: 'Acme Corp',
      ExternalKey: 'ext-caller-001',
    }

    const result = transformContact(raw)

    // id maps from Id (as string)
    expect(result.id).toBe('200')
    // externalId maps from ExternalKey when present
    expect(result.externalId).toBe('ext-caller-001')
    // email maps from Email
    expect(result.email).toBe('jane@example.com')
    // name maps from Name (preferred over joined first+last)
    expect(result.name).toBe('Jane Doe')
    // phone maps from Phone
    expect(result.phone).toBe('+14155550123')
    // organizationId from ClientId
    expect(result.organizationId).toBe('7')
    // platform
    expect(result.platform).toBe('vivantio')

    expect(() => ContactSchema.parse(result)).not.toThrow()
  })

  it('falls back to joined first+last when Name absent', () => {
    const raw: RawVivantioCaller = {
      Id: 300,
      FirstName: 'Bob',
      LastName: 'Builder',
      Email: 'bob@example.com',
    }

    const result = transformContact(raw)

    // name built from FirstName + LastName when Name absent
    expect(result.name).toBe('Bob Builder')

    expect(() => ContactSchema.parse(result)).not.toThrow()
  })

  it('falls back to Id as externalId when ExternalKey absent', () => {
    const raw: RawVivantioCaller = {
      Id: 400,
      Name: 'No External Key',
      Email: 'nokey@example.com',
    }

    const result = transformContact(raw)

    // externalId falls back to String(Id)
    expect(result.externalId).toBe('400')

    expect(() => ContactSchema.parse(result)).not.toThrow()
  })

  it('handles missing email and phone gracefully', () => {
    const raw: RawVivantioCaller = {
      Id: 500,
      Name: 'Minimal Contact',
    }

    const result = transformContact(raw)

    expect(result.email).toBeUndefined()
    expect(result.phone).toBeUndefined()
    expect(result.organizationId).toBeUndefined()

    expect(() => ContactSchema.parse(result)).not.toThrow()
  })
})
