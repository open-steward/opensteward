/**
 * Fixture built from the goal object documented for GET /wb/apis/goal and
 * GET /wb/apis/goal/{goal_id} (https://apidocs.myworkboard.com/openapi.json).
 * The spec ships no example payloads, so values follow the documented types
 * (every field is a `string`).
 */
import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawWorkboardGoal,
} from '../../../../../../../src/verticals/projects/adapters/workboard/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

const raw: RawWorkboardGoal = {
  goal_id: '1203',
  goal_name: 'Grow revenue 20%',
  goal_narrative: 'Increase ARR by Q4',
  goal_type: { id: '1', name: 'Team' },
  goal_owner: '55',
  goal_create_at: '2024-01-02',
  goal_modified_at: '2024-02-03T10:00:00Z',
  goal_start_date: '2024-01-01',
  goal_target_date: '2024-12-31',
  goal_progress: '40',
  goal_status: '1',
  goal_owner_full_name: 'Ada Lovelace',
  goal_team_id: '77',
  goal_team_name: 'Engineering',
}

describe('workboard transformProject', () => {
  it('maps the documented goal fields and parses as a Project', () => {
    const p = ProjectSchema.parse(transformProject(raw))
    expect(p).toMatchObject({
      id: '1203',
      externalId: '1203',
      workspaceId: '77',
      name: 'Grow revenue 20%',
      description: 'Increase ARR by Q4',
      status: 'active',
      ownerId: '55',
      startDate: '2024-01-01T00:00:00.000Z',
      endDate: '2024-12-31T00:00:00.000Z',
      createdAt: '2024-01-02T00:00:00.000Z',
      updatedAt: '2024-02-03T10:00:00.000Z',
      platform: 'workboard',
      metadata: {
        goal_progress: '40',
        goal_team_name: 'Engineering',
        goal_owner_full_name: 'Ada Lovelace',
      },
    })
  })

  it('maps goal_status "2" (closed) to completed and anything else to unknown', () => {
    expect(transformProject({ ...raw, goal_status: '2' }).status).toBe('completed')
    expect(ProjectSchema.parse(transformProject({ ...raw, goal_status: '9' })).status).toBe(
      'unknown',
    )
  })

  it('leaves out timestamps whose zone or format cannot be read unambiguously', () => {
    const p = transformProject({
      ...raw,
      goal_create_at: '2024-02-03T10:00:00',
      goal_modified_at: '1704153600',
    })
    expect(p.createdAt).toBeUndefined()
    expect(p.updatedAt).toBeUndefined()
    expect(() => ProjectSchema.parse(p)).not.toThrow()
    expect(
      transformProject({ ...raw, goal_start_date: '2024-02-03 10:00:00' }).startDate,
    ).toBeUndefined()
  })

  it('gives a personal goal (goal_team_id null) the empty workspace, not a placeholder id', () => {
    const personal = { ...raw, goal_type: '2', goal_team_id: null, goal_team_name: null }
    const p = ProjectSchema.parse(transformProject(personal as unknown as RawWorkboardGoal))
    expect(p.workspaceId).toBe('')
    expect(transformProject({ ...raw, goal_team_id: undefined }).workspaceId).toBe('')
  })

  it('refuses a goal with no goal_name rather than naming it', () => {
    expect(() => transformProject({ ...raw, goal_name: undefined })).toThrow(/1203 has no name/)
    expect(() => transformProject({ ...raw, goal_name: '' })).toThrow(/no name/)
  })

  it('refuses a goal with no goal_id', () => {
    expect(() => transformProject({ ...raw, goal_id: undefined })).toThrow(/goal_id/)
  })
})
