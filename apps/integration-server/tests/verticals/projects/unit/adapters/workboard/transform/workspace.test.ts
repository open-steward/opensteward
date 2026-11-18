/**
 * Fixture built from the team object documented for GET /wb/apis/team
 * (https://apidocs.myworkboard.com/openapi.json).
 */
import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawWorkboardTeam,
} from '../../../../../../../src/verticals/projects/adapters/workboard/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

const raw: RawWorkboardTeam = {
  team_id: '77',
  external_id: 'eng',
  parent_team_id: '1',
  dotted_team_ids: [],
  team_name: 'Engineering',
  team_owner: '55',
  team_type: 'functional',
  level: '2',
  created_from: 'web',
  created_at: '1704153600',
  updated_at: '1704153600',
  team_state: '1',
}

describe('workboard transformWorkspace', () => {
  it('maps the documented team fields and parses as a Workspace', () => {
    const w = WorkspaceSchema.parse(transformWorkspace(raw))
    expect(w).toMatchObject({
      id: '77',
      externalId: '77',
      name: 'Engineering',
      platform: 'workboard',
      metadata: { team_type: 'functional', team_state: '1', parent_team_id: '1' },
    })
    expect(w.memberCount).toBeUndefined()
  })

  it('counts team_members when the single-team response carries them', () => {
    const w = WorkspaceSchema.parse(
      transformWorkspace({ ...raw, team_members: [{ id: '1' }, { id: '2' }] }),
    )
    expect(w.memberCount).toBe(2)
  })

  it('refuses a team with no team_name rather than naming it', () => {
    expect(() => transformWorkspace({ ...raw, team_name: undefined })).toThrow(/77 has no name/)
  })

  it('refuses a team with no team_id', () => {
    expect(() => transformWorkspace({ ...raw, team_id: undefined })).toThrow(/team_id/)
  })
})
