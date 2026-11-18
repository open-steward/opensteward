import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawPerdooObjective,
} from '../../../../../../../src/verticals/projects/adapters/perdoo/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('perdoo transformProject', () => {
  const raw: RawPerdooObjective = {
    id: 'obj-001',
    name: 'Grow revenue by 20%',
    description: 'Primary revenue objective for Q1',
    progress: 55,
    status: 'ON_TRACK',
    stage: 'ACTIVE',
    lead: { id: 'user-42', name: 'Jane Doe' },
    timeframe: { id: 'tf-2024-q1', name: 'Q1 2024' },
    parent: { id: 'obj-parent-001', name: 'Company OKR' },
    groups: {
      edges: [
        { node: { id: 'group-sales', name: 'Sales' } },
        { node: { id: 'group-marketing', name: 'Marketing' } },
      ],
    },
    startDate: '2024-01-15T12:00:00.000Z',
    dueDate: '2024-03-31T23:59:59.000Z',
    createdDate: '2024-01-10T08:00:00.000Z',
    lastEditedDate: '2024-02-01T14:20:00.000Z',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformProject(raw)
    expect(result.id).toBe('obj-001')
    expect(result.externalId).toBe('obj-001')
  })

  it('maps name from raw.name', () => {
    const result = transformProject(raw)
    expect(result.name).toBe('Grow revenue by 20%')
  })

  it('maps workspaceId from first group edge node id', () => {
    const result = transformProject(raw)
    expect(result.workspaceId).toBe('group-sales')
  })

  it('workspaceId is empty string when groups is absent', () => {
    const result = transformProject({ ...raw, groups: undefined })
    expect(result.workspaceId).toBe('')
  })

  it('workspaceId is empty string when groups.edges is empty', () => {
    const result = transformProject({ ...raw, groups: { edges: [] } })
    expect(result.workspaceId).toBe('')
  })

  it('maps ownerId from lead.id', () => {
    const result = transformProject(raw)
    expect(result.ownerId).toBe('user-42')
  })

  it('ownerId is undefined when lead is null', () => {
    const result = transformProject({ ...raw, lead: null })
    expect(result.ownerId).toBeUndefined()
  })

  it('maps description', () => {
    const result = transformProject(raw)
    expect(result.description).toBe('Primary revenue objective for Q1')
  })

  it('maps startDate to ISO string', () => {
    const result = transformProject(raw)
    expect(result.startDate).toBe('2024-01-15T12:00:00.000Z')
  })

  it('maps endDate from dueDate to ISO string', () => {
    const result = transformProject(raw)
    expect(result.endDate).toBe('2024-03-31T23:59:59.000Z')
  })

  it('maps createdAt from createdDate', () => {
    const result = transformProject(raw)
    expect(result.createdAt).toBe('2024-01-10T08:00:00.000Z')
  })

  it('maps updatedAt from lastEditedDate', () => {
    const result = transformProject(raw)
    expect(result.updatedAt).toBe('2024-02-01T14:20:00.000Z')
  })

  it('platform is perdoo', () => {
    const result = transformProject(raw)
    expect(result.platform).toBe('perdoo')
  })

  it('status is active when stage is ACTIVE and status is ON_TRACK', () => {
    const result = transformProject({ ...raw, stage: 'ACTIVE', status: 'ON_TRACK' })
    expect(result.status).toBe('active')
  })

  it('status is archived when stage is CLOSED', () => {
    const result = transformProject({ ...raw, stage: 'CLOSED' })
    expect(result.status).toBe('archived')
  })

  it('status is on_hold when stage is DRAFT', () => {
    const result = transformProject({ ...raw, stage: 'DRAFT' })
    expect(result.status).toBe('on_hold')
  })

  it('status is on_hold when status is OFF_TRACK (non-CLOSED/DRAFT stage)', () => {
    const result = transformProject({ ...raw, stage: 'ACTIVE', status: 'OFF_TRACK' })
    expect(result.status).toBe('on_hold')
  })

  it('status is on_hold when status is NEEDS_ATTENTION', () => {
    const result = transformProject({ ...raw, stage: 'ACTIVE', status: 'NEEDS_ATTENTION' })
    expect(result.status).toBe('on_hold')
  })

  it('stage takes precedence — CLOSED returns archived even if status is OFF_TRACK', () => {
    const result = transformProject({ ...raw, stage: 'CLOSED', status: 'OFF_TRACK' })
    expect(result.status).toBe('archived')
  })

  it('metadata includes stage', () => {
    const result = transformProject(raw)
    expect(result.metadata.stage).toBe('ACTIVE')
  })

  it('metadata includes commitStatus from raw.status', () => {
    const result = transformProject(raw)
    expect(result.metadata.commitStatus).toBe('ON_TRACK')
  })

  it('metadata includes progress as string', () => {
    const result = transformProject(raw)
    expect(result.metadata.progress).toBe('55')
  })

  it('metadata includes timeframeId', () => {
    const result = transformProject(raw)
    expect(result.metadata.timeframeId).toBe('tf-2024-q1')
  })

  it('metadata includes timeframeName', () => {
    const result = transformProject(raw)
    expect(result.metadata.timeframeName).toBe('Q1 2024')
  })

  it('metadata includes parentId', () => {
    const result = transformProject(raw)
    expect(result.metadata.parentId).toBe('obj-parent-001')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformProject(raw)
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })
})
