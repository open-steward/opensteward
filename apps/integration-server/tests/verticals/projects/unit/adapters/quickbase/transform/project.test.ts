import { describe, it, expect } from 'vitest'
import {
  transformTable,
  type RawQuickbaseTable,
} from '../../../../../../../src/verticals/projects/adapters/quickbase/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

describe('quickbase transformTable', () => {
  const raw: RawQuickbaseTable = {
    id: 'bqbtz9iy4',
    name: 'Sprint Tasks',
    alias: '_dbid_sprint_tasks',
    description: 'All tasks for the current sprint.',
    created: '2024-01-15T10:00:00.000Z',
    updated: '2024-01-16T10:00:00.000Z',
    nextRecordId: 101,
    keyFieldId: 3,
    singleRecordName: 'Task',
    pluralRecordName: 'Tasks',
  }

  it('maps id from raw.id', () => {
    const result = transformTable(raw, 'app123')
    expect(result.id).toBe('bqbtz9iy4')
  })

  it('maps externalId from raw.id', () => {
    const result = transformTable(raw, 'app123')
    expect(result.externalId).toBe('bqbtz9iy4')
  })

  it('maps name from raw.name', () => {
    const result = transformTable(raw, 'app123')
    expect(result.name).toBe('Sprint Tasks')
  })

  it('status is always unknown', () => {
    const result = transformTable(raw, 'app123')
    expect(result.status).toBe('unknown')
  })

  it('maps workspaceId from the appId argument', () => {
    const result = transformTable(raw, 'app123')
    expect(result.workspaceId).toBe('app123')
  })

  it('workspaceId is empty string when appId is omitted', () => {
    const result = transformTable(raw)
    expect(result.workspaceId).toBe('')
  })

  it('maps createdAt from raw.created as ISO datetime', () => {
    const result = transformTable(raw, 'app123')
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
  })

  it('maps updatedAt from raw.updated as ISO datetime', () => {
    const result = transformTable(raw, 'app123')
    expect(result.updatedAt).toBe('2024-01-16T10:00:00.000Z')
  })

  it('platform is quickbase', () => {
    const result = transformTable(raw, 'app123')
    expect(result.platform).toBe('quickbase')
  })

  it('metadata includes alias', () => {
    const result = transformTable(raw, 'app123')
    expect(result.metadata.alias).toBe('_dbid_sprint_tasks')
  })

  it('metadata includes keyFieldId', () => {
    const result = transformTable(raw, 'app123')
    expect(result.metadata.keyFieldId).toBe('3')
  })

  it('metadata includes singleRecordName', () => {
    const result = transformTable(raw, 'app123')
    expect(result.metadata.singleRecordName).toBe('Task')
  })

  it('metadata includes pluralRecordName', () => {
    const result = transformTable(raw, 'app123')
    expect(result.metadata.pluralRecordName).toBe('Tasks')
  })

  it('description maps from raw.description', () => {
    const result = transformTable(raw, 'app123')
    expect(result.description).toBe('All tasks for the current sprint.')
  })

  it('passes ProjectSchema.parse', () => {
    const result = transformTable(raw, 'app123')
    expect(() => ProjectSchema.parse(result)).not.toThrow()
  })

  it('name is empty string when raw.name is absent', () => {
    const result = transformTable({ id: 'bqbtz9iy4' })
    expect(result.name).toBe('')
  })
})
