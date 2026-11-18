import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawProcoreProject,
} from '../../../../../../../src/verticals/projects/adapters/procore/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('procore transformProject', () => {
  const raw: RawProcoreProject = {
    id: 500,
    name: 'Tower Block A',
    display_name: 'Tower Block A (Display)',
    project_number: 'TBA-001',
    description: 'Construction of Tower Block A',
    active: true,
    start_date: '2026-01-01T00:00:00.000Z',
    completion_date: '2027-06-30T00:00:00.000Z',
    created_at: '2025-12-01T08:00:00.000Z',
    updated_at: '2026-02-01T10:00:00.000Z',
    company: { id: 10, name: 'Acme Construction' },
    project_stage: { id: 1, name: 'Course of Construction' },
  }

  it('maps id and externalId to string of numeric id', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('500')
    expect(result.externalId).toBe('500')
  })

  it('name prefers display_name over name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Tower Block A (Display)')
  })

  it('name falls back to name when display_name absent', () => {
    const result = transformProject({ ...raw, display_name: undefined })
    expect(result.name).toBe('Tower Block A')
  })

  it('description from raw.description', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Construction of Tower Block A')
  })

  it('workspaceId from company.id', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('10')
  })

  it('workspaceId is empty string when company absent', () => {
    const result = transformProject({ ...raw, company: undefined })
    expect(result.workspaceId).toBe('')
  })

  it('status is active for active project with non-terminal stage', () => {
    const result = transformProject(raw)
    expect(result.status).toBe('active')
  })

  it('status is completed when stage includes "complete"', () => {
    const result = transformProject({ ...raw, project_stage: { name: 'Complete' } })
    expect(result.status).toBe('completed')
  })

  it('status is completed when stage includes "closed"', () => {
    const result = transformProject({ ...raw, project_stage: { name: 'Closed Out' } })
    expect(result.status).toBe('completed')
  })

  it('status is on_hold when stage includes "warranty"', () => {
    const result = transformProject({ ...raw, project_stage: { name: 'Warranty' } })
    expect(result.status).toBe('on_hold')
  })

  it('status is on_hold when stage includes "on hold"', () => {
    const result = transformProject({ ...raw, project_stage: { name: 'On Hold' } })
    expect(result.status).toBe('on_hold')
  })

  it('status is archived when active=false and no terminal stage', () => {
    const result = transformProject({ ...raw, active: false, project_stage: { name: 'Bidding' } })
    expect(result.status).toBe('archived')
  })

  it('startDate from start_date', () => {
    const result = transformProject(raw)
    expect(result.startDate).toBe('2026-01-01T00:00:00.000Z')
  })

  it('endDate from completion_date', () => {
    const result = transformProject(raw)
    expect(result.endDate).toBe('2027-06-30T00:00:00.000Z')
  })

  it('createdAt from created_at', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe('2025-12-01T08:00:00.000Z')
  })

  it('updatedAt from updated_at', () => {
    const result = transformProject(raw)
    expect(result.updatedAt).toBe('2026-02-01T10:00:00.000Z')
  })

  it('metadata.projectNumber from project_number', () => {
    const result = transformProject(raw)
    expect(result.metadata.projectNumber).toBe('TBA-001')
  })

  it('metadata.stage from project_stage.name', () => {
    const result = transformProject(raw)
    expect(result.metadata.stage).toBe('Course of Construction')
  })

  it('metadata.companyName from company.name', () => {
    const result = transformProject(raw)
    expect(result.metadata.companyName).toBe('Acme Construction')
  })

  it('platform is procore', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('procore')
  })

  it('raw is preserved on output', () => {
    const result = transformProject(raw)
    expect(result.raw).toBe(raw)
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
