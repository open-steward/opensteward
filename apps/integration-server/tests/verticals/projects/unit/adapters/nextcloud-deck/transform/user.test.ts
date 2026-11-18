import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawNextcloudDeckUser,
} from '../../../../../../../src/verticals/projects/adapters/nextcloud-deck/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('nextcloud-deck transformUser', () => {
  const raw: RawNextcloudDeckUser = {
    uid: 'jdoe',
    displayname: 'Jane Doe',
    type: 0,
  }

  it('id is bare uid when no workspaceId supplied', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('jdoe')
  })

  it('id is compound boardId/uid when workspaceId is supplied', () => {
    const result = transformUser(raw, '12')
    expect(result.id).toBe('12/jdoe')
  })

  it('externalId is always the bare uid', () => {
    const result = transformUser(raw, '12')
    expect(result.externalId).toBe('jdoe')
  })

  it('maps name from displayname', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Jane Doe')
  })

  it('falls back name to uid when displayname is absent', () => {
    const result = transformUser({ uid: 'alice' })
    expect(result.name).toBe('alice')
  })

  it('email is always undefined (no email in Deck user objects)', () => {
    const result = transformUser(raw)
    expect(result.email).toBeUndefined()
  })

  it('workspaceIds contains workspaceId when supplied', () => {
    const result = transformUser(raw, '12')
    expect(result.workspaceIds).toEqual(['12'])
  })

  it('workspaceIds is empty when not supplied', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is nextcloud-deck', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('nextcloud-deck')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw, '12')
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
