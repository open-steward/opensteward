import { describe, it, expect } from 'vitest'
import {
  transformTask,
  type RawCodaTable,
} from '../../../../../../../src/verticals/projects/adapters/coda/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

describe('coda transformTask', () => {
  const raw: RawCodaTable = {
    id: 'table-xyz',
    type: 'table',
    tableType: 'table',
    name: 'Tasks',
    rowCount: 25,
    layout: 'simple',
    createdAt: '2024-02-01T09:00:00.000Z',
    updatedAt: '2024-02-20T17:00:00.000Z',
    parent: { id: 'page-1', type: 'page', name: 'Overview' },
    displayColumn: { id: 'col-1', type: 'column', name: 'Name' },
  }

  it('builds composite id as {docId}:{tableId}', () => {
    const result = transformTask(raw, 'doc-abc')
    expect(result.id).toBe('doc-abc:table-xyz')
  })

  it('externalId is the bare table id', () => {
    const result = transformTask(raw, 'doc-abc')
    expect(result.externalId).toBe('table-xyz')
  })

  it('projectId is caller-supplied docId', () => {
    const result = transformTask(raw, 'doc-abc')
    expect(result.projectId).toBe('doc-abc')
  })

  it('projectId is empty string when no docId supplied', () => {
    const result = transformTask(raw)
    expect(result.projectId).toBe('')
  })

  it('id equals bare tableId when docId is not supplied', () => {
    const result = transformTask(raw)
    expect(result.id).toBe('table-xyz')
  })

  it('maps title from name', () => {
    const result = transformTask(raw, 'doc-abc')
    expect(result.title).toBe('Tasks')
  })

  it('status is always open (no lifecycle on tables)', () => {
    const result = transformTask(raw, 'doc-abc')
    expect(result.status).toBe('open')
  })

  it('subtaskCount reflects rowCount', () => {
    const result = transformTask(raw, 'doc-abc')
    expect(result.subtaskCount).toBe(25)
  })

  it('parentId is undefined for a regular table', () => {
    const result = transformTask(raw, 'doc-abc')
    expect(result.parentId).toBeUndefined()
  })

  it('parentId is set to parentTable.id for a view', () => {
    const viewRaw: RawCodaTable = {
      ...raw,
      tableType: 'view',
      parentTable: { id: 'table-base', type: 'table', name: 'Base Tasks' },
    }
    const result = transformTask(viewRaw, 'doc-abc')
    expect(result.parentId).toBe('table-base')
  })

  it('metadata.platformType is table for a regular table', () => {
    const result = transformTask(raw, 'doc-abc')
    expect(result.metadata.platformType).toBe('table')
  })

  it('metadata.platformType is view for a view', () => {
    const viewRaw: RawCodaTable = {
      ...raw,
      tableType: 'view',
      parentTable: { id: 'table-base', type: 'table' },
    }
    const result = transformTask(viewRaw, 'doc-abc')
    expect(result.metadata.platformType).toBe('view')
  })

  it('createdAt parses ISO datetime', () => {
    const result = transformTask(raw, 'doc-abc')
    expect(result.createdAt).toBe('2024-02-01T09:00:00.000Z')
  })

  it('platform is coda', () => {
    const result = transformTask(raw, 'doc-abc')
    expect(result.platform).toBe('coda')
  })

  it('assigneeIds is always empty (no assignee concept on tables)', () => {
    const result = transformTask(raw, 'doc-abc')
    expect(result.assigneeIds).toEqual([])
  })

  it('passes TaskSchema.parse', () => {
    const result = transformTask(raw, 'doc-abc')
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })
})
