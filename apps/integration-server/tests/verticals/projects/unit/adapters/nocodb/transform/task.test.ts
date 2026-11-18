import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawNocodbRecord,
} from '../../../../../../../src/verticals/projects/adapters/nocodb/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

function makeRecord(overrides: Partial<RawNocodbRecord> = {}): RawNocodbRecord {
  return {
    Id: 42,
    Title: 'Fix login bug',
    CreatedAt: '2024-02-05T08:30:00.000Z',
    UpdatedAt: '2024-02-10T09:00:00.000Z',
    ...overrides,
  }
}

describe('nocodb transformTask', () => {
  it('canonical id is <tableId>:<rowId>', () => {
    const result = transformTask(makeRecord(), 'tbl-5')
    expect(result.id).toBe('tbl-5:42')
  })

  it('externalId is the row id as string', () => {
    const result = transformTask(makeRecord(), 'tbl-5')
    expect(result.externalId).toBe('42')
  })

  it('projectId is tableId', () => {
    const result = transformTask(makeRecord(), 'tbl-5')
    expect(result.projectId).toBe('tbl-5')
  })

  it('maps title from raw.Title', () => {
    const result = transformTask(makeRecord(), 'tbl-5')
    expect(result.title).toBe('Fix login bug')
  })

  it('falls back to first non-system string field when Title absent', () => {
    const result = transformTask({ Id: 7, Name: 'My Record' }, 'tbl-1')
    expect(result.title).toBe('My Record')
  })

  it('falls back to String(Id) when no text fields', () => {
    const result = transformTask({ Id: 99 }, 'tbl-1')
    expect(result.title).toBe('99')
  })

  it('status is always open', () => {
    const result = transformTask(makeRecord(), 'tbl-5')
    expect(result.status).toBe('open')
  })

  it('assigneeIds is always empty', () => {
    const result = transformTask(makeRecord(), 'tbl-5')
    expect(result.assigneeIds).toEqual([])
  })

  it('tagIds is always empty', () => {
    const result = transformTask(makeRecord(), 'tbl-5')
    expect(result.tagIds).toEqual([])
  })

  it('maps createdAt from raw.CreatedAt', () => {
    const result = transformTask(makeRecord(), 'tbl-5')
    expect(result.createdAt).toBe('2024-02-05T08:30:00.000Z')
  })

  it('maps updatedAt from raw.UpdatedAt', () => {
    const result = transformTask(makeRecord(), 'tbl-5')
    expect(result.updatedAt).toBe('2024-02-10T09:00:00.000Z')
  })

  it('platform is nocodb', () => {
    const result = transformTask(makeRecord(), 'tbl-5')
    expect(result.platform).toBe('nocodb')
  })

  it('metadata.rowId reflects raw.Id as string', () => {
    const result = transformTask(makeRecord(), 'tbl-5')
    expect(result.metadata.rowId).toBe('42')
  })

  it('metadata.tableId reflects the tableId arg', () => {
    const result = transformTask(makeRecord(), 'tbl-5')
    expect(result.metadata.tableId).toBe('tbl-5')
  })

  it('parentId is always undefined', () => {
    const result = transformTask(makeRecord(), 'tbl-5')
    expect(result.parentId).toBeUndefined()
  })

  it('passes TaskSchema.parse without throwing', () => {
    const result = transformTask(makeRecord(), 'tbl-5')
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
