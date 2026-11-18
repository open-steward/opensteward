import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawActivecollabProject,
} from '../../../../../../../src/verticals/projects/adapters/activecollab/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('activecollab transformProject', () => {
  const raw: RawActivecollabProject = {
    id: 42,
    name: 'Acme Onboarding',
    body: 'Onboard the Acme team.',
    is_completed: false,
    is_trashed: false,
    company_id: 5,
    leader_id: 3,
    created_on: 1700000000,
    updated_on: 1700001000,
    count_tasks: 12,
    url_path: '/projects/42',
  }

  it('maps id and externalId from numeric id', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('42')
    expect(result.externalId).toBe('42')
  })

  it('maps workspaceId from company_id', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('5')
  })

  it('maps name and description', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Acme Onboarding')
    expect(result.description).toBe('Onboard the Acme team.')
  })

  it('status is active when not trashed or completed', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is archived when is_trashed is true', () => {
    const result = transformProject({ ...raw, is_trashed: true })
    expect(result.status).toBe('archived')
  })

  it('status is completed when is_completed is true and not trashed', () => {
    const result = transformProject({ ...raw, is_completed: true, is_trashed: false })
    expect(result.status).toBe('completed')
  })

  it('is_trashed takes priority over is_completed', () => {
    const result = transformProject({ ...raw, is_trashed: true, is_completed: true })
    expect(result.status).toBe('archived')
  })

  it('maps ownerId from leader_id', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('3')
  })

  it('createdAt uses epoch-seconds conversion', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe(new Date(1700000000 * 1000).toISOString())
  })

  it('platform is activecollab', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('activecollab')
  })

  it('metadata.countTasks reflects count_tasks', () => {
    const result = transformProject(raw)
    expect(result.metadata.countTasks).toBe('12')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })

  it('workspaceId is empty string when company_id is absent', () => {
    const result = transformProject({ id: 1 })
    expect(result.workspaceId).toBe('')
  })

  it('ownerId is undefined when leader_id is absent', () => {
    const result = transformProject({ id: 1 })
    expect(result.ownerId).toBeUndefined()
  })
})
