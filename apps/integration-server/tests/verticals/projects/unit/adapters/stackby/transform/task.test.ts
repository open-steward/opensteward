import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawStackbyRow,
} from '../../../../../../../src/verticals/projects/adapters/stackby/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('stackby transformTask', () => {
  const raw: RawStackbyRow = {
    rowId: 'row_001',
    field: {
      Name: 'Fix login bug',
      Description: 'The login page crashes on mobile.',
      Status: 'In Progress',
      Priority: 'High',
      Assignee: 'alice',
      'Due Date': '2026-03-01T00:00:00.000Z',
      Created: '2026-01-10T00:00:00.000Z',
    },
  }

  it('maps id and externalId from rowId', () => {
    const result = transformTask(raw, 'stk_abc123/Tasks')
    expect(result.id).toBe('row_001')
    expect(result.externalId).toBe('row_001')
  })

  it('maps projectId from the passed argument', () => {
    const result = transformTask(raw, 'stk_abc123/Tasks')
    expect(result.projectId).toBe('stk_abc123/Tasks')
  })

  it('maps title from Name field', () => {
    const result = transformTask(raw, 'proj')
    expect(result.title).toBe('Fix login bug')
  })

  it('maps description from Description field', () => {
    const result = transformTask(raw, 'proj')
    expect(result.description).toBe('The login page crashes on mobile.')
  })

  it('status is in_progress for "In Progress"', () => {
    const result = transformTask(raw, 'proj')
    expect(result.status).toBe('in_progress')
  })

  it('status is closed for "Done"', () => {
    const result = transformTask({ rowId: 'r2', field: { Status: 'Done' } }, 'proj')
    expect(result.status).toBe('closed')
  })

  it('status is open when no status field', () => {
    const result = transformTask({ rowId: 'r3', field: {} }, 'proj')
    expect(result.status).toBe('open')
  })

  it('priority is high for "High"', () => {
    const result = transformTask(raw, 'proj')
    expect(result.priority).toBe('high')
  })

  it('priority is urgent for "Urgent"', () => {
    const result = transformTask({ rowId: 'r4', field: { Priority: 'Urgent' } }, 'proj')
    expect(result.priority).toBe('urgent')
  })

  it('priority is undefined when Priority field is absent', () => {
    const result = transformTask({ rowId: 'r5', field: {} }, 'proj')
    expect(result.priority).toBeUndefined()
  })

  it('maps assignee from Assignee field as single entry', () => {
    const result = transformTask(raw, 'proj')
    expect(result.assigneeIds).toEqual(['alice'])
  })

  it('assigneeIds is empty when no Assignee field', () => {
    const result = transformTask({ rowId: 'r6', field: {} }, 'proj')
    expect(result.assigneeIds).toEqual([])
  })

  it('tagIds is always empty (stackby has no tags)', () => {
    const result = transformTask(raw, 'proj')
    expect(result.tagIds).toEqual([])
  })

  it('platform is stackby', () => {
    const result = transformTask(raw, 'proj')
    expect(result.platform).toBe('stackby')
  })

  it('non-object field values land in metadata', () => {
    const result = transformTask(raw, 'proj')
    expect(result.metadata['Name']).toBe('Fix login bug')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw, 'stk_abc123/Tasks')
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
