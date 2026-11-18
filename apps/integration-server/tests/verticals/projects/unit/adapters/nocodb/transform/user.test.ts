/**
 * NocoDB workspace user → canonical User.
 *
 * GET /api/v2/meta/workspaces/{workspaceId}/users ("Workspace users list ☁",
 * NocoDB's own OpenAPI,
 * https://raw.githubusercontent.com/nocodb/nocodb/develop/packages/nocodb/src/schema/swagger-v2.json)
 * answers `WorkspaceUserList` `{ list: WorkspaceUser[], pageInfo }`, and
 * `WorkspaceUser` documents exactly `email`, `fk_user_id`, `invite_accepted`,
 * `invite_token` and `roles`. The spec gives no example, so the fixture is
 * one value per documented property.
 */
import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawNocodbWorkspaceUser,
} from '../../../../../../../src/verticals/projects/adapters/nocodb/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

function makeUser(overrides: Partial<RawNocodbWorkspaceUser> = {}): RawNocodbWorkspaceUser {
  return {
    email: 'alice@acme.example',
    fk_user_id: 'usr0Adp9PMG9o7uJy',
    invite_accepted: true,
    invite_token: 'secret-invite-token',
    roles: 'workspace-level-editor',
    ...overrides,
  }
}

describe('nocodb transformUser', () => {
  it('parses with UserSchema', () => {
    expect(() => UserSchema.parse(transformUser(makeUser(), 'w1'))).not.toThrow()
  })

  it('takes id and externalId from fk_user_id', () => {
    const u = transformUser(makeUser(), 'w1')
    expect(u.id).toBe('usr0Adp9PMG9o7uJy')
    expect(u.externalId).toBe('usr0Adp9PMG9o7uJy')
  })

  it('takes email from email, and the name from it (the only documented identity)', () => {
    const u = transformUser(makeUser(), 'w1')
    expect(u.email).toBe('alice@acme.example')
    expect(u.name).toBe('alice@acme.example')
  })

  it('scopes the user to the workspace it was listed from', () => {
    expect(transformUser(makeUser(), 'w9').workspaceIds).toEqual(['w9'])
  })

  it('carries roles and invite_accepted in metadata', () => {
    expect(transformUser(makeUser(), 'w1').metadata).toEqual({
      roles: 'workspace-level-editor',
      inviteAccepted: 'true',
    })
  })

  it('never passes the invite token through raw', () => {
    const u = transformUser(makeUser(), 'w1')
    expect(u.raw).not.toHaveProperty('invite_token')
    expect(JSON.stringify(u)).not.toContain('secret-invite-token')
  })

  it('throws rather than invent an id when fk_user_id is absent', () => {
    expect(() => transformUser(makeUser({ fk_user_id: undefined }), 'w1')).toThrow(/fk_user_id/)
  })

  it('throws rather than invent a name when email is absent', () => {
    expect(() => transformUser(makeUser({ email: undefined }), 'w1')).toThrow(/email/)
  })

  it('platform is nocodb', () => {
    expect(transformUser(makeUser(), 'w1').platform).toBe('nocodb')
  })
})
