import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawMantisbtProject,
} from '../../../../../../../src/verticals/projects/adapters/mantisbt/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('mantisbt transformProject', () => {
  const raw: RawMantisbtProject = {
    id: 7,
    name: 'Bug Tracker',
    description: 'Track all the bugs.',
    status: { id: 10, name: 'development', label: 'Development' },
    enabled: true,
    view_state: { id: 10, name: 'public', label: 'Public' },
  }

  it('maps id and externalId from numeric id', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('7')
    expect(result.externalId).toBe('7')
  })

  it('maps name from raw.name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Bug Tracker')
  })

  it('maps description', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Track all the bugs.')
  })

  it('workspaceId is the fixed placeholder "default"', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('default')
  })

  it('status is active when enabled=true and status.name is development', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is archived when enabled is false', () => {
    const result = transformProject({ ...raw, enabled: false })
    expect(result.status).toBe('archived')
  })

  it('status is archived when status.name is closed', () => {
    const result = transformProject({ ...raw, status: { name: 'closed' } })
    expect(result.status).toBe('archived')
  })

  it('platform is mantisbt', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('mantisbt')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformProject({ id: 1 })
    expect(result.id).toBe('1')
    expect(result.name).toBe('')
    expect(result.status).toBe('active')
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
