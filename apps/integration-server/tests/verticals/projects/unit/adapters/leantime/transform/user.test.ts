import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawLeantimeUser,
} from '../../../../../../../src/verticals/projects/adapters/leantime/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('leantime transformUser', () => {
  const raw: RawLeantimeUser = {
    id: 5,
    username: 'jdoe@example.com',
    firstname: 'Jane',
    lastname: 'Doe',
    email: 'jdoe@example.com',
    role: 'editor',
    status: 'active',
    profileId: 9,
    phone: '+1-555-0100',
    jobTitle: 'Engineer',
    department: 'Engineering',
  }

  it('maps id as string', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('5')
    expect(result.externalId).toBe('5')
  })

  it('composes name from firstname + lastname', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('maps email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jdoe@example.com')
  })

  it('falls back to username for email when email absent', () => {
    const result = transformUser({ ...raw, email: undefined })
    expect(result.email).toBe('jdoe@example.com')
  })

  it('name falls back to username when firstname and lastname absent', () => {
    const result = transformUser({ ...raw, firstname: undefined, lastname: undefined })
    expect(result.name).toBe('jdoe@example.com')
  })

  it('workspaceIds is always empty', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is leantime', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('leantime')
  })

  it('metadata contains role, status, jobTitle, department', () => {
    const result = transformUser(raw)
    expect(result.metadata.role).toBe('editor')
    expect(result.metadata.status).toBe('active')
    expect(result.metadata.jobTitle).toBe('Engineer')
    expect(result.metadata.department).toBe('Engineering')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
