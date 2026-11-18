import { describe, it, expect } from 'vitest'
import { transformUser } from '../../../../../../../src/verticals/projects/adapters/twproject/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'
import { PERSON_GET, PERSON_LIST } from '../fixtures/documented-samples'

describe('twproject transformUser (documented person response example)', () => {
  const raw = PERSON_LIST.objects[0]!

  it('parses as a canonical User named by displayName', () => {
    const u = UserSchema.parse(transformUser(raw))
    expect(u).toMatchObject({
      id: '105',
      externalId: '105',
      name: 'Johanna Lake',
      workspaceIds: [],
      platform: 'twproject',
      metadata: {},
    })
  })

  it('omits the documented empty email', () => {
    expect(transformUser(raw).email).toBeUndefined()
  })

  it('maps a present email', () => {
    const u = UserSchema.parse(transformUser({ ...raw, email: 'johanna.lake@example.test' }))
    expect(u.email).toBe('johanna.lake@example.test')
  })

  it('parses the documented get example too', () => {
    expect(UserSchema.parse(transformUser(PERSON_GET.object)).name).toBe('Johanna Lake')
  })

  it('throws on a person with no displayName rather than inventing a name', () => {
    expect(() => transformUser({ id: '9' })).toThrow(/displayName/)
  })
})
