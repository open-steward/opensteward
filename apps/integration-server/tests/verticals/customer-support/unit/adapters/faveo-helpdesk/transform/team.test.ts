/**
 * Fixture from https://developers.faveohelpdesk.com/dependency-list/ (type teams):
 *   "data":{ "types":[ { "id":1, "name":"type-name 1" }, { "id":2, "name":"type-name 2" } ] }
 */
import { describe, it, expect } from 'vitest'
import {
  transformTeam,
  type RawFaveoTeam,
} from '../../../../../../../src/verticals/customer-support/adapters/faveo-helpdesk/transform/team'
import { TeamSchema } from '../../../../../../../src/verticals/customer-support/schema/team'

describe('faveo-helpdesk transformTeam', () => {
  const raw: RawFaveoTeam = { id: 1, name: 'type-name 1' }

  it('maps the documented id and name', () => {
    const result = TeamSchema.parse(transformTeam(raw))
    expect(result).toEqual({
      id: '1',
      externalId: '1',
      name: 'type-name 1',
      platform: 'faveo-helpdesk',
      metadata: {},
      raw,
    })
  })

  it('throws when a team has no name rather than inventing one', () => {
    expect(() => transformTeam({ id: 2 } as unknown as RawFaveoTeam)).toThrow(/team 2 has no name/)
  })
})
