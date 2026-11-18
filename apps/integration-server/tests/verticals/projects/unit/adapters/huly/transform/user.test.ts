/**
 * Fixture fields follow the documented interfaces (Huly publishes no example
 * response): contact `Person`/`Contact` with the `contact:mixin:Employee` mixin.
 */
import { describe, it, expect } from 'vitest'
import {
  transformUser,
  type RawHulyUser,
} from '../../../../../../../src/verticals/projects/adapters/huly/transform/user'
import { UserSchema } from '../../../../../../../src/verticals/projects/schema/user'

const WS = '3f2c9a4e-8d1b-4c6f-9e2a-5b7d1c0f4e88'

function makeRaw(overrides: Partial<RawHulyUser> = {}): RawHulyUser {
  return {
    _id: 'person-1',
    _class: 'contact:class:Person',
    space: 'contact:space:Contacts',
    name: 'Doe,John',
    city: 'New York',
    modifiedOn: 1700000100000,
    ...overrides,
  }
}

describe('transformUser', () => {
  it('parses against UserSchema', () => {
    const u = UserSchema.parse(transformUser(makeRaw(), WS))
    expect(u).toMatchObject({
      id: 'person-1',
      externalId: 'person-1',
      name: 'Doe,John',
      workspaceIds: [WS],
      platform: 'huly',
      metadata: {},
    })
  })

  it('reports no email: Person documents carry none', () => {
    expect(UserSchema.parse(transformUser(makeRaw(), WS)).email).toBeUndefined()
  })
})
