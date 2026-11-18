import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawBaserowRow,
} from '../../../../../../../src/verticals/projects/adapters/baserow/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('baserow transformTask', () => {
  const raw: RawBaserowRow = {
    id: 99,
    order: '1.00000000000000000000',
    created_on: '2025-03-01T10:00:00.000Z',
    updated_on: '2025-04-01T12:30:00.000Z',
    field_1: 'My Row Title',
    field_2: 'some text value',
  }
  const tableId = 'table_55'

  it('maps id and title from field_1', () => {
    const result = transformTask(raw, tableId)
    expect(result.id).toBe('99')
    expect(result.title).toBe('My Row Title')
  })

  it('projectId is the tableId argument', () => {
    const result = transformTask(raw, tableId)
    expect(result.projectId).toBe('table_55')
  })

  it('createdAt and updatedAt are ISO strings', () => {
    const result = transformTask(raw, tableId)
    expect(result.createdAt).toBe('2025-03-01T10:00:00.000Z')
    expect(result.updatedAt).toBe('2025-04-01T12:30:00.000Z')
  })

  it('status defaults to open', () => {
    const result = transformTask(raw, tableId)
    expect(result.status).toBe('open')
  })

  it('platform is baserow', () => {
    const result = transformTask(raw, tableId)
    expect(result.platform).toBe('baserow')
  })

  it('dynamic field values land in metadata', () => {
    const result = transformTask(raw, tableId)
    expect(result.metadata.field_2).toBe('some text value')
    expect(result.metadata.tableId).toBe('table_55')
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw, tableId)
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })

  it('title falls back to Row {id} when field_1 absent', () => {
    const result = transformTask({ id: 7 }, tableId)
    expect(result.title).toBe('Row 7')
  })
})
