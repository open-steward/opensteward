import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawCodaUser,
} from '../../../../../../../src/verticals/projects/adapters/coda/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('coda transformUser', () => {
  const raw: RawCodaUser = {
    email: 'jane.doe@acme.example',
    name: 'Jane Doe',
    type: 'user',
    role: 'editor',
    pictureUrl: 'https://example.com/avatar.png',
    registeredAt: '2023-06-01T00:00:00.000Z',
    workspace: { id: 'ws-xyz', name: 'Acme Workspace' },
  }

  it('id and externalId are derived from email', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('jane.doe@acme.example')
    expect(result.externalId).toBe('jane.doe@acme.example')
  })

  it('falls back to loginId when email is absent', () => {
    const result = transformUser({ loginId: 'login@example.com', name: 'Bob' })
    expect(result.id).toBe('login@example.com')
  })

  it('maps email', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('jane.doe@acme.example')
  })

  it('maps name', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('workspaceIds uses caller-supplied workspaceId', () => {
    const result = transformUser(raw, 'ws-supplied')
    expect(result.workspaceIds).toEqual(['ws-supplied'])
  })

  it('workspaceIds falls back to workspace.id when no arg supplied', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual(['ws-xyz'])
  })

  it('workspaceIds is empty when no workspace info available', () => {
    const result = transformUser({ email: 'a@b.example', name: 'A' })
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is coda', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('coda')
  })

  it('metadata.role reflects role', () => {
    const result = transformUser(raw)
    expect(result.metadata.role).toBe('editor')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw, 'ws-xyz')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
