import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawMeisterplanProject,
} from '../../../../../../../src/verticals/projects/adapters/meisterplan/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('meisterplan transformProject', () => {
  const raw: RawMeisterplanProject = {
    id: 'proj-abc',
    name: 'Cloud Migration',
    start: '2026-01-01',
    finish: '2026-06-30',
    status: { name: 'Active' },
    manager: { id: 'mgr-1' },
    externalId: 'ext-001',
    description: 'Migrate all services to the cloud.',
  }

  it('maps id directly', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('proj-abc')
  })

  it('maps externalId from raw.externalId when present', () => {
    const result = transformProject(raw)
    expect(result.externalId).toBe('ext-001')
  })

  it('falls back externalId to raw.id when externalId is absent', () => {
    const result = transformProject({ ...raw, externalId: null })
    expect(result.externalId).toBe('proj-abc')
  })

  it('maps name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Cloud Migration')
  })

  it('maps description', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Migrate all services to the cloud.')
  })

  it('workspaceId is the caller-supplied scenarioId', () => {
    const result = transformProject(raw, 'scenario-1')
    expect(result.workspaceId).toBe('scenario-1')
  })

  it('workspaceId is empty string when no scenarioId supplied', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('')
  })

  it('status is active for Active', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is on_hold for On Hold', () => {
    const result = transformProject({ ...raw, status: { name: 'On Hold' } })
    expect(result.status).toBe('on_hold')
  })

  it('status is completed for Done', () => {
    const result = transformProject({ ...raw, status: { name: 'Done' } })
    expect(result.status).toBe('completed')
  })

  it('status is cancelled for Cancelled', () => {
    const result = transformProject({ ...raw, status: { name: 'Cancelled' } })
    expect(result.status).toBe('cancelled')
  })

  it('status is archived for Archived', () => {
    const result = transformProject({ ...raw, status: { name: 'Archived' } })
    expect(result.status).toBe('archived')
  })

  it('ownerId maps from manager.id', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('mgr-1')
  })

  it('startDate is ISO string from start', () => {
    const result = transformProject(raw)
    expect(result.startDate).toBe('2026-01-01T00:00:00.000Z')
  })

  it('endDate is ISO string from finish', () => {
    const result = transformProject(raw)
    expect(result.endDate).toBe('2026-06-30T00:00:00.000Z')
  })

  it('platform is meisterplan', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('meisterplan')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw, 'scenario-1')
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
