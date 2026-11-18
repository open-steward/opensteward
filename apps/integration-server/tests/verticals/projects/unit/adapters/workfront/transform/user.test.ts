import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawWorkfrontUser,
} from '../../../../../../../src/verticals/projects/adapters/workfront/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('workfront transformUser', () => {
  const raw: RawWorkfrontUser = {
    ID: 'user-9',
    name: 'Carol White',
    emailAddr: 'carol@example.com',
    username: 'cwhite',
    homeGroupID: 'group-2',
  }

  it('maps id and externalId from ID', () => {
    const result = transformUser(raw)
    expect(result.id).toBe('user-9')
    expect(result.externalId).toBe('user-9')
  })

  it('maps name', () => {
    const result = transformUser(raw)
    expect(result.name).toBe('Carol White')
  })

  it('maps email from emailAddr (not email)', () => {
    const result = transformUser(raw)
    expect(result.email).toBe('carol@example.com')
  })

  it('workspaceIds uses homeGroupID when no param', () => {
    const result = transformUser(raw)
    expect(result.workspaceIds).toEqual(['group-2'])
  })

  it('explicit workspaceId param overrides homeGroupID', () => {
    const result = transformUser(raw, 'group-override')
    expect(result.workspaceIds).toEqual(['group-override'])
  })

  it('workspaceIds is empty when homeGroupID absent and no param', () => {
    const result = transformUser({ ...raw, homeGroupID: undefined })
    expect(result.workspaceIds).toEqual([])
  })

  it('platform is workfront', () => {
    const result = transformUser(raw)
    expect(result.platform).toBe('workfront')
  })

  it('metadata contains username', () => {
    const result = transformUser(raw)
    expect(result.metadata.username).toBe('cwhite')
  })

  it('passes UserSchema.parse', () => {
    const result = transformUser(raw)
    expect(() => UserSchema.parse(result)).not.toThrow()
  })
})
