import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawFactroContact,
} from '../../../../../../../src/verticals/projects/adapters/factro/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('factro transformUser', () => {
  const raw: RawFactroContact = {
    id: 'contact-99',
    firstName: 'Jane',
    lastName: 'Doe',
    emailAddress: 'jane.doe@acme.example',
    description: 'Lead engineer.',
    city: 'Berlin',
    phone: '+49-30-12345678',
    salutation: 'Dr.',
  }

  it('maps id and externalId from contact id', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('contact-99')
    expect(result.externalId).toBe('contact-99')
  })

  it('maps email from emailAddress', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jane.doe@acme.example')
  })

  it('builds name from firstName and lastName', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('falls back to id when both names are absent', () => {
    const result = transformUser({ id: 'contact-bare' })
    expect(result.name).toBe('contact-bare')
  })

  it('uses only lastName when firstName is absent', () => {
    const result = transformUser({ id: 'c1', lastName: 'Smith' })
    expect(result.name).toBe('Smith')
  })

  it('workspaceIds uses caller-supplied workspaceId', () => {
    const result = transformUser(raw, 'ws-42')
    expect(result.workspaceIds).toEqual(['ws-42'])
  })

  it('workspaceIds is empty when not supplied', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is factro', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('factro')
  })

  it('metadata.salutation reflects salutation', () => {
    const result = transformUser(raw)
    expect(result.metadata.salutation).toBe('Dr.')
  })

  it('metadata.city reflects city', () => {
    const result = transformUser(raw)
    expect(result.metadata.city).toBe('Berlin')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw, 'ws-1')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
