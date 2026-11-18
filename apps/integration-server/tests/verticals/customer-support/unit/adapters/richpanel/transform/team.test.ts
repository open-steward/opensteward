/**
 * Richpanel team transform, from the documented List Teams response.
 *
 * https://developer.richpanel.com/reference/list-teams (append .md for the spec):
 *   "{\n     \"team\": [\n        {\n            \"updated_at\": \"2025-04-25T12:11:46.718Z\",\n
 *    \"created_at\": \"2025-04-25T12:11:46.718Z\",\n            \"id\": \"uuid-uuid-416d-a061-f37e10dd371c\",\n
 *    \"name\": \"Executive Team\",\n            \"organization_id\": \"org_id_1\"\n        }\n      ]\n   }"
 */
import { describe, expect, it } from 'vitest'
import { TeamSchema } from '../../../../../../../src/verticals/customer-support/schema/team'
import { transformTeam } from '../../../../../../../src/verticals/customer-support/adapters/richpanel/transform/team'

const documented = {
  updated_at: '2025-04-25T12:11:46.718Z',
  created_at: '2025-04-25T12:11:46.718Z',
  id: 'uuid-uuid-416d-a061-f37e10dd371c',
  name: 'Executive Team',
  organization_id: 'org_id_1',
}

describe('richpanel transformTeam', () => {
  it('maps the documented team object onto the canonical Team', () => {
    const out = TeamSchema.parse(transformTeam(documented))
    expect(out.id).toBe('uuid-uuid-416d-a061-f37e10dd371c')
    expect(out.externalId).toBe('uuid-uuid-416d-a061-f37e10dd371c')
    expect(out.name).toBe('Executive Team')
    expect(out.platform).toBe('richpanel')
    expect(out.metadata).toEqual({
      organization_id: 'org_id_1',
      created_at: '2025-04-25T12:11:46.718Z',
      updated_at: '2025-04-25T12:11:46.718Z',
    })
    // No member count is documented on the team object.
    expect(out.memberCount).toBeUndefined()
    expect(out.raw).toEqual(documented)
  })

  it('throws when the documented id is missing rather than inventing one', () => {
    expect(() => transformTeam({ name: 'x' } as never)).toThrow(/id/)
  })

  it('throws when the documented id is an empty string rather than keying by it', () => {
    expect(() => transformTeam({ id: '', name: 'x' })).toThrow(/id/)
  })

  it('throws when the documented name is missing rather than defaulting it', () => {
    expect(() => transformTeam({ id: 'x' } as never)).toThrow(/name/)
  })
})
