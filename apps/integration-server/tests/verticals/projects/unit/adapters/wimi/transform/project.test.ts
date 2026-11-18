import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawLinearProject,
} from '../../../../../../../src/verticals/projects/adapters/wimi/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('wimi transformProject', () => {
  const raw: RawLinearProject = {
    gid: 'proj-200',
    name: 'Q1 Roadmap',
    notes: 'All Q1 deliverables',
    archived: false,
    current_status: { color: 'green', text: 'On track' },
    owner: { gid: 'user-1' },
    workspace: { gid: 'ws-10', name: 'Acme' },
    start_on: '2024-01-01',
    due_on: '2024-03-31',
    created_at: '2023-12-01T00:00:00.000Z',
    modified_at: '2024-01-10T10:00:00.000Z',
  }

  it('maps id and externalId from gid', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('proj-200')
    expect(result.externalId).toBe('proj-200')
  })

  it('maps name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Q1 Roadmap')
  })

  it('maps description from notes', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('All Q1 deliverables')
  })

  it('maps workspaceId from workspace.gid', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('ws-10')
  })

  it('status is active when current_status.color is green', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is archived when archived=true', () => {
    const result = transformProject({ ...raw, archived: true })
    expect(result.status).toBe('archived')
  })

  it('status is on_hold when current_status.color is blue', () => {
    const result = transformProject({ ...raw, current_status: { color: 'blue' } })
    expect(result.status).toBe('on_hold')
  })

  it('status is on_hold when current_status.color is red', () => {
    const result = transformProject({ ...raw, current_status: { color: 'red' } })
    expect(result.status).toBe('on_hold')
  })

  it('maps ownerId from owner.gid', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('user-1')
  })

  it('startDate and endDate come from start_on and due_on', () => {
    const result = transformProject(raw)
    expect(result.startDate).toBe('2024-01-01T00:00:00.000Z')
    expect(result.endDate).toBe('2024-03-31T00:00:00.000Z')
  })

  it('platform is wimi', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('wimi')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
