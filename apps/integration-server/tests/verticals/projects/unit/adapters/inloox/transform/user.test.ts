import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawInlooxContact,
} from '../../../../../../../src/verticals/projects/adapters/inloox/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('inloox transformUser', () => {
  const raw: RawInlooxContact = {
    ContactId: 'contact-uuid-9999',
    DisplayName: 'Jane Doe',
    FirstName: 'Jane',
    LastName: 'Doe',
    Email: 'jane.doe@acme.example',
    CompanyName: 'Acme Corp',
    Title: 'Engineering Manager',
    IsIdentity: true,
    DescriptionHTML: '<p>Notes about Jane</p>',
  }

  it('maps ContactId to id and externalId', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('contact-uuid-9999')
    expect(result.externalId).toBe('contact-uuid-9999')
  })

  it('uses DisplayName as name when present', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('falls back to "FirstName LastName" when DisplayName is absent', () => {
    const result = transformUser({ ...raw, DisplayName: undefined })
    expect(result.name).toBe('Jane Doe')
  })

  it('falls back to FirstName alone when LastName is absent', () => {
    const result = transformUser({ ...raw, DisplayName: undefined, LastName: undefined })
    expect(result.name).toBe('Jane')
  })

  it('falls back to LastName alone when FirstName is absent', () => {
    const result = transformUser({ ...raw, DisplayName: undefined, FirstName: undefined })
    expect(result.name).toBe('Doe')
  })

  it('DisplayName takes precedence over FirstName + LastName', () => {
    const result = transformUser({ ...raw, DisplayName: 'J. Doe (Engineering)' })
    expect(result.name).toBe('J. Doe (Engineering)')
  })

  it('maps Email to email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jane.doe@acme.example')
  })

  it('email is undefined when Email is absent', () => {
    const result = transformUser({ ...raw, Email: undefined })
    expect(result.email).toBeUndefined()
  })

  it('workspaceIds is [workspaceId] when workspaceId arg is provided', () => {
    const result = transformUser(raw, 'ws-portfolio-123')
    expect(result.workspaceIds).toEqual(['ws-portfolio-123'])
  })

  it('workspaceIds is empty array when no workspaceId arg supplied', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is "inloox"', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('inloox')
  })

  it('metadata.companyName comes from CompanyName', () => {
    const result = transformUser(raw)
    expect(result.metadata['companyName']).toBe('Acme Corp')
  })

  it('metadata.title comes from Title', () => {
    const result = transformUser(raw)
    expect(result.metadata['title']).toBe('Engineering Manager')
  })

  it('metadata.isIdentity is "true" when IsIdentity is true', () => {
    const result = transformUser(raw)
    expect(result.metadata['isIdentity']).toBe('true')
  })

  it('metadata.isIdentity is "false" when IsIdentity is false', () => {
    const result = transformUser({ ...raw, IsIdentity: false })
    expect(result.metadata['isIdentity']).toBe('false')
  })

  it('metadata keys absent when fields are undefined', () => {
    const result = transformUser({ ContactId: 'c1', DisplayName: 'Test' })
    expect(result.metadata['companyName']).toBeUndefined()
    expect(result.metadata['title']).toBeUndefined()
    expect(result.metadata['isIdentity']).toBeUndefined()
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw, 'ws-1')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('passes UserSchema.parse without workspaceId', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })

  it('handles minimal raw object gracefully', () => {
    const result = transformUser({})
    expect(result.id).toBe('')
    expect(result.name).toBe('')
    expect(result.workspaceIds).toEqual([])
    expect(result.metadata).toEqual({})
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
