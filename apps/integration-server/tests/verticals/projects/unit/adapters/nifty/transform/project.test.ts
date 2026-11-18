/**
 * Fixture: the ProjectResponse example of GET /api/v1.0/projects/{project_id}
 * in https://developers.niftypm.com/docs/api/v1.0/1.0/nifty-v1-openapi.json.
 * ProjectResponse documents no created/updated timestamps, so none are read.
 */
import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawNiftyProject,
} from '../../../../../../../src/verticals/projects/adapters/nifty/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

function makeProject(overrides: Partial<RawNiftyProject> = {}): RawNiftyProject {
  return {
    id: 'Pq4nZt7Rm',
    nice_id: 'PROJ',
    name: 'Website relaunch',
    description: 'Marketing site rebuild for the Q4 launch.',
    initials: 'WR',
    logo: null,
    color: '#00A99B',
    secondary_color: '#0F172A',
    demo: false,
    archived: false,
    auto_milestones: false,
    default_tasks_view: 'kanban',
    access_type: 'team',
    owner: 'i5vtiganU9y25V',
    members: ['i5vtiganU9y25V', 'j7kwmqbxT2p9Lm'],
    general_discussion: 'Ds3vRk8Wq',
    subteam: 'St5hYc1Bn',
    progress: 42,
    joined: true,
    general_discussion_muted: false,
    enabled_modules: ['tasks', 'discussions', 'docs'],
    disabled_modules: ['time'],
    total_story_points: 34,
    completed_story_points: 13,
    removed: false,
    ...overrides,
  }
}

describe('nifty transformProject', () => {
  it('parses as a canonical Project', () => {
    expect(() => ProjectSchema.parse(transformProject(makeProject()))).not.toThrow()
  })

  it('maps id and externalId from raw.id', () => {
    const result = ProjectSchema.parse(transformProject(makeProject()))
    expect(result.id).toBe('Pq4nZt7Rm')
    expect(result.externalId).toBe('Pq4nZt7Rm')
  })

  it('maps workspaceId from raw.subteam', () => {
    expect(ProjectSchema.parse(transformProject(makeProject())).workspaceId).toBe('St5hYc1Bn')
  })

  it('throws rather than inventing a workspaceId when subteam is absent', () => {
    expect(() => transformProject(makeProject({ subteam: undefined }))).toThrow(/subteam/)
  })

  it('throws rather than inventing an empty name when name is absent', () => {
    const raw = makeProject()
    delete (raw as Record<string, unknown>)['name']
    expect(() => transformProject(raw)).toThrow(/no name/)
  })

  it('maps name and description', () => {
    const result = ProjectSchema.parse(transformProject(makeProject()))
    expect(result.name).toBe('Website relaunch')
    expect(result.description).toBe('Marketing site rebuild for the Q4 launch.')
  })

  it('status is active when archived and removed are false', () => {
    expect(transformProject(makeProject()).status).toBe('active')
  })

  it('status is archived when raw.archived is true', () => {
    expect(transformProject(makeProject({ archived: true })).status).toBe('archived')
  })

  it('status is archived when raw.removed is true', () => {
    expect(transformProject(makeProject({ removed: true })).status).toBe('archived')
  })

  it('maps ownerId from raw.owner', () => {
    expect(transformProject(makeProject()).ownerId).toBe('i5vtiganU9y25V')
  })

  it('reads no timestamps: ProjectResponse documents none', () => {
    const result = ProjectSchema.parse(
      transformProject(
        makeProject({
          created_at: '2024-01-15T09:30:00.000Z',
          updated_at: '2024-02-01T14:20:00.000Z',
        }),
      ),
    )
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('platform is nifty', () => {
    expect(transformProject(makeProject()).platform).toBe('nifty')
  })

  it('metadata carries niceId, memberCount, progress and story points as strings', () => {
    const { metadata } = ProjectSchema.parse(transformProject(makeProject()))
    expect(metadata.niceId).toBe('PROJ')
    expect(metadata.memberCount).toBe('2')
    expect(metadata.progress).toBe('42')
    expect(metadata.totalStoryPoints).toBe('34')
    expect(metadata.completedStoryPoints).toBe('13')
    expect(metadata.accessType).toBe('team')
  })
})
