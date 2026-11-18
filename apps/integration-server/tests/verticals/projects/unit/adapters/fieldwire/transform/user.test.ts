import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawFieldwireUser,
} from '../../../../../../../src/verticals/projects/adapters/fieldwire/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('fieldwire transformUser', () => {
  const raw: RawFieldwireUser = {
    id: 88,
    email: 'jane.doe@acme.example',
    first_name: 'Jane',
    last_name: 'Doe',
    phone_number: '+1-555-0100',
    company: 'Acme Construction',
    job_title: 'Site Manager',
    language: 'en',
    is_confirmed: true,
  }

  it('maps id as stringified integer', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('88')
    expect(result.externalId).toBe('88')
  })

  it('maps name as firstName + space + lastName', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('maps email correctly', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jane.doe@acme.example')
  })

  it('workspaceIds contains projectId when provided', () => {
    const result = transformUser(raw, 'proj-uuid-001')
    expect(result.workspaceIds).toEqual(['proj-uuid-001'])
  })

  it('workspaceIds is empty array when no projectId provided', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is fieldwire', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('fieldwire')
  })

  it('maps metadata: company, jobTitle, language, isConfirmed', () => {
    const result = transformUser(raw)
    expect(result.metadata.company).toBe('Acme Construction')
    expect(result.metadata.jobTitle).toBe('Site Manager')
    expect(result.metadata.language).toBe('en')
    expect(result.metadata.isConfirmed).toBe('true')
  })

  it('name falls back to email when first and last names are absent', () => {
    const result = transformUser({
      id: 99,
      email: 'nobody@example.com',
      first_name: null,
      last_name: null,
    })
    expect(result.name).toBe('nobody@example.com')
  })

  it('name uses only first name when last name is absent', () => {
    const result = transformUser({ id: 100, first_name: 'Alice', last_name: null })
    expect(result.name).toBe('Alice')
  })

  it('handles string id', () => {
    const result = transformUser({ id: '42', email: 'str@example.com' })
    expect(result.id).toBe('42')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
