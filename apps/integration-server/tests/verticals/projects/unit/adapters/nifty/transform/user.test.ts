import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawNiftyMember,
} from '../../../../../../../src/verticals/projects/adapters/nifty/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

function makeMember(overrides: Partial<RawNiftyMember> = {}): RawNiftyMember {
  return {
    id: 'usr-jane',
    name: 'Jane Doe',
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane@acme.example',
    contact_email: null,
    avatar: null,
    role: 'admin',
    team: 'team-alpha',
    subteams: ['team-alpha', 'team-beta'],
    deactivated: false,
    ...overrides,
  }
}

describe('nifty transformUser', () => {
  it('maps id and externalId from raw.id', () => {
    const result = transformUser(makeMember())
    expect(result.id).toBe('usr-jane')
    expect(result.externalId).toBe('usr-jane')
  })

  it('composes name from first_name and last_name', () => {
    const result = transformUser(makeMember())
    expect(result.name).toBe('Jane Doe')
  })

  it('falls back to raw.name when first_name and last_name are absent', () => {
    const result = transformUser(
      makeMember({ first_name: null, last_name: null, name: 'Fallback Name' }),
    )
    expect(result.name).toBe('Fallback Name')
  })

  it('uses only first_name when last_name is absent', () => {
    const result = transformUser(makeMember({ last_name: null }))
    expect(result.name).toBe('Jane')
  })

  it('maps email from raw.email', () => {
    const result = transformUser(makeMember())
    expect(result.email).toBe('jane@acme.example')
  })

  it('falls back to contact_email when email is null', () => {
    const result = transformUser(
      makeMember({ email: null, contact_email: 'jane-contact@acme.example' }),
    )
    expect(result.email).toBe('jane-contact@acme.example')
  })

  it('workspaceIds from explicit workspaceId arg', () => {
    const result = transformUser(makeMember(), 'team-override')
    expect(result.workspaceIds).toEqual(['team-override'])
  })

  it('workspaceIds from raw.subteams when no explicit arg', () => {
    const result = transformUser(makeMember())
    expect(result.workspaceIds).toEqual(['team-alpha', 'team-beta'])
  })

  it('workspaceIds is empty when no arg and subteams is null', () => {
    const result = transformUser(makeMember({ subteams: null }))
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is nifty', () => {
    const result = transformUser(makeMember())
    expect(result.platform).toBe('nifty')
  })

  it('metadata.role reflects raw.role', () => {
    const result = transformUser(makeMember())
    expect(result.metadata.role).toBe('admin')
  })

  it('metadata.deactivated reflects raw.deactivated as string', () => {
    const result = transformUser(makeMember({ deactivated: true }))
    expect(result.metadata.deactivated).toBe('true')
  })

  it('passes UserSchema.parse without throwing', () => {
    const result = transformUser(makeMember())
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
