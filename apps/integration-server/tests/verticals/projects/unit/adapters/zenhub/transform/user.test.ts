/**
 * Fixture built from the public schema's `ZenhubUser` type
 * (https://developers.zenhub.com/schema/zenhub-public-api.graphql):
 * `id: ID!  name: String  email: String  githubUser: User` with
 * `User.login: String!`. ZenhubUser has no `login` field of its own.
 */
import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawZenhubUser,
} from '../../../../../../../src/verticals/projects/adapters/zenhub/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

describe('zenhub transformUser', () => {
  const raw: RawZenhubUser = {
    id: 'Z2lkOi8vcmFwdG9yL1plbmh1YlVzZXIvMQ',
    name: 'Alice Smith',
    email: 'alice@example.com',
    githubUser: { login: 'alice' },
  }

  it('maps the documented fields and parses with UserSchema', () => {
    const result = UserSchema.parse(transformUser(raw, 'ws-1'))
    expect(result).toMatchObject({
      id: 'Z2lkOi8vcmFwdG9yL1plbmh1YlVzZXIvMQ',
      externalId: 'Z2lkOi8vcmFwdG9yL1plbmh1YlVzZXIvMQ',
      name: 'Alice Smith',
      email: 'alice@example.com',
      workspaceIds: ['ws-1'],
      platform: 'zenhub',
      metadata: { githubLogin: 'alice' },
    })
  })

  it('a null name stays empty: it does not borrow the GitHub login', () => {
    const result = UserSchema.parse(transformUser({ ...raw, name: null }))
    expect(result.name).toBe('')
    expect(result.metadata.githubLogin).toBe('alice')
  })

  it('null email and no GitHub user are omitted', () => {
    const result = UserSchema.parse(transformUser({ ...raw, email: null, githubUser: null }))
    expect(result.email).toBeUndefined()
    expect(result.metadata).toEqual({})
    expect(result.workspaceIds).toEqual([])
  })
})
