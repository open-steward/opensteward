import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawPerdooKeyResult,
} from '../../../../../../../src/verticals/projects/adapters/perdoo/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('perdoo transformTask', () => {
  const raw: RawPerdooKeyResult = {
    id: 'kr-001',
    name: 'Increase MRR to $500k',
    description: 'Monthly recurring revenue key result',
    status: 'ON_TRACK',
    type: 'KEY_RESULT',
    archived: false,
    lead: { id: 'user-42', name: 'Jane Doe' },
    objective: { id: 'obj-001', name: 'Grow revenue by 20%' },
    parent: { id: 'kr-parent-001', name: 'Parent KR' },
    childrenCount: 3,
    contributors: {
      edges: [{ node: { id: 'user-10' } }, { node: { id: 'user-11' } }],
    },
    startDate: '2024-01-15T12:00:00.000Z',
    dueDate: '2024-03-31T23:59:59.000Z',
    createdDate: '2024-01-10T08:00:00.000Z',
    lastEditedDate: '2024-02-01T14:20:00.000Z',
    startValue: 0,
    endValue: 500000,
    currentValue: 275000,
    metricUnit: 'USD',
    weight: 1,
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('kr-001')
    expect(result.externalId).toBe('kr-001')
  })

  it('maps title from raw.name', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Increase MRR to $500k')
  })

  it('maps projectId from raw.objective.id when no objectiveId arg', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('obj-001')
  })

  it('projectId uses objectiveId arg when provided', () => {
    const result = transformTask(raw, 'override-obj-id')
    expect(result.projectId).toBe('override-obj-id')
  })

  it('projectId is empty string when no objectiveId arg and objective is absent', () => {
    const result = transformTask({ ...raw, objective: undefined } as any)
    expect(result.projectId).toBe('')
  })

  it('maps parentId from raw.parent.id', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBe('kr-parent-001')
  })

  it('parentId is undefined when parent is absent', () => {
    const result = transformTask({ ...raw, parent: undefined })
    expect(result.parentId).toBeUndefined()
  })

  it('maps description', () => {
    const result = transformTask(raw)
    expect(result.description).toBe('Monthly recurring revenue key result')
  })

  it('status is open when not archived and status is ON_TRACK', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('open')
  })

  it('status is closed when archived is true', () => {
    const result = transformTask({ ...raw, archived: true })
    expect(result.status).toBe('closed')
  })

  it('status is closed when status is ACCOMPLISHED', () => {
    const result = transformTask({ ...raw, archived: false, status: 'ACCOMPLISHED' })
    expect(result.status).toBe('closed')
  })

  it('status is open for any other status value', () => {
    const result = transformTask({ ...raw, archived: false, status: 'NEEDS_ATTENTION' })
    expect(result.status).toBe('open')
  })

  it('priority is always undefined', () => {
    const result = transformTask(raw)
    expect(result.priority).toBeUndefined()
  })

  it('maps dueDate from raw.dueDate to ISO string', () => {
    const result = transformTask(raw)
    expect(result.dueDate).toBe('2024-03-31T23:59:59.000Z')
  })

  it('assigneeIds starts with lead.id', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds[0]).toBe('user-42')
  })

  it('assigneeIds includes contributor ids after lead', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toContain('user-10')
    expect(result.assigneeIds).toContain('user-11')
  })

  it('assigneeIds has correct total length (lead + contributors)', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toHaveLength(3)
  })

  it('assigneeIds is contributor ids only when lead is absent', () => {
    const result = transformTask({ ...raw, lead: null })
    expect(result.assigneeIds).toEqual(['user-10', 'user-11'])
  })

  it('assigneeIds is empty when lead is absent and contributors is empty', () => {
    const result = transformTask({ ...raw, lead: null, contributors: { edges: [] } })
    expect(result.assigneeIds).toEqual([])
  })

  it('maps subtaskCount from childrenCount', () => {
    const result = transformTask(raw)
    expect(result.subtaskCount).toBe(3)
  })

  it('subtaskCount is undefined when childrenCount is null', () => {
    const result = transformTask({ ...raw, childrenCount: null })
    expect(result.subtaskCount).toBeUndefined()
  })

  it('maps createdAt from createdDate', () => {
    const result = transformTask(raw)
    expect(result.createdAt).toBe('2024-01-10T08:00:00.000Z')
  })

  it('maps updatedAt from lastEditedDate', () => {
    const result = transformTask(raw)
    expect(result.updatedAt).toBe('2024-02-01T14:20:00.000Z')
  })

  it('platform is perdoo', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('perdoo')
  })

  it('tagIds is an empty array', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual([])
  })

  it('metadata includes type', () => {
    const result = transformTask(raw)
    expect(result.metadata.type).toBe('KEY_RESULT')
  })

  it('metadata includes commitStatus from raw.status', () => {
    const result = transformTask(raw)
    expect(result.metadata.commitStatus).toBe('ON_TRACK')
  })

  it('metadata includes metricUnit', () => {
    const result = transformTask(raw)
    expect(result.metadata.metricUnit).toBe('USD')
  })

  it('metadata includes startValue, endValue, currentValue as strings', () => {
    const result = transformTask(raw)
    expect(result.metadata.startValue).toBe('0')
    expect(result.metadata.endValue).toBe('500000')
    expect(result.metadata.currentValue).toBe('275000')
  })

  it('metadata includes weight as string', () => {
    const result = transformTask(raw)
    expect(result.metadata.weight).toBe('1')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
