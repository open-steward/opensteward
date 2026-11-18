import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawKanboardTask,
} from '../../../../../../../src/verticals/projects/adapters/kanboard/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('kanboard transformTask', () => {
  const raw: RawKanboardTask = {
    id: '88',
    title: 'Build login page',
    description: 'Create the login UI',
    project_id: '12',
    column_id: '3',
    swimlane_id: '1',
    owner_id: '5',
    creator_id: '2',
    category_id: '7',
    color_id: 'blue',
    is_active: '1',
    date_due: '1700000000',
    date_creation: '1690000000',
    date_modification: '1695000000',
    priority: '2',
    score: '5',
    reference: 'REF-001',
  }

  it('maps id as string', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('88')
    expect(result.externalId).toBe('88')
  })

  it('maps title', () => {
    const result = transformTask(raw)
    expect(result.title).toBe('Build login page')
  })

  it('maps projectId from project_id', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('12')
  })

  it('overrides projectId with explicit argument', () => {
    const result = transformTask(raw, 'proj-override')
    expect(result.projectId).toBe('proj-override')
  })

  it('status is open when is_active=1', () => {
    const result = transformTask(raw)
    expect(result.status).toBe('open')
  })

  it('status is closed when is_active=0', () => {
    const result = transformTask({ ...raw, is_active: '0' })
    expect(result.status).toBe('closed')
  })

  it('priority=2 maps to high', () => {
    const result = transformTask(raw)
    expect(result.priority).toBe('high')
  })

  it('priority=0 maps to low', () => {
    const result = transformTask({ ...raw, priority: '0' })
    expect(result.priority).toBe('low')
  })

  it('priority=1 maps to medium', () => {
    const result = transformTask({ ...raw, priority: '1' })
    expect(result.priority).toBe('medium')
  })

  it('priority=3 maps to urgent', () => {
    const result = transformTask({ ...raw, priority: '3' })
    expect(result.priority).toBe('urgent')
  })

  it('maps assigneeIds from owner_id', () => {
    const result = transformTask(raw)
    expect(result.assigneeIds).toEqual(['5'])
  })

  it('tagIds is always empty (fetched separately)', () => {
    const result = transformTask(raw)
    expect(result.tagIds).toEqual([])
  })

  it('parentId is always undefined', () => {
    const result = transformTask(raw)
    expect(result.parentId).toBeUndefined()
  })

  it('platform is kanboard', () => {
    const result = transformTask(raw)
    expect(result.platform).toBe('kanboard')
  })

  it('metadata contains columnId, swimlaneId, colorId', () => {
    const result = transformTask(raw)
    expect(result.metadata.columnId).toBe('3')
    expect(result.metadata.swimlaneId).toBe('1')
    expect(result.metadata.colorId).toBe('blue')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })

  it('assigneeIds is empty when owner_id absent', () => {
    const result = transformTask({ ...raw, owner_id: undefined })
    expect(result.assigneeIds).toEqual([])
  })
})
