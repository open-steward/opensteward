import { describe, it, expect } from 'vitest'
import {
  transformRecord,
  type RawQuickbaseRecord,
  type QuickbaseFieldValue,
} from '../../../../../../../src/verticals/projects/adapters/quickbase/transform/task'
import { TaskSchema } from '../../../../../../../src/verticals/projects/schema/task'

// Quickbase built-in FID constants: 1=DATE_CREATED, 2=DATE_MODIFIED, 3=RECORD_ID, 4=RECORD_OWNER

describe('quickbase transformRecord', () => {
  const raw: RawQuickbaseRecord = {
    '3': { value: 42 },
    '1': { value: '2024-01-15T10:00:00.000Z' },
    '2': { value: '2024-01-16T10:00:00.000Z' },
    '4': { value: { id: 'user1', name: 'Alice', email: 'alice@example.com' } },
    '7': { value: 'My Task Title' },
  }

  it('maps projectId from tableId argument', () => {
    const result = transformRecord(raw, 'tbl_sprint', { titleFieldId: 7 })
    expect(result.projectId).toBe('tbl_sprint')
  })

  it('maps id from record id field (FID 3)', () => {
    const result = transformRecord(raw, 'tbl_sprint', { titleFieldId: 7 })
    expect(result.id).toBe('42')
  })

  it('externalId equals id', () => {
    const result = transformRecord(raw, 'tbl_sprint', { titleFieldId: 7 })
    expect(result.externalId).toBe('42')
  })

  it('maps title from the titleFieldId field value', () => {
    const result = transformRecord(raw, 'tbl_sprint', { titleFieldId: 7 })
    expect(result.title).toBe('My Task Title')
  })

  it('falls back to recordId as title when titleFieldId is not provided', () => {
    const result = transformRecord(raw, 'tbl_sprint')
    expect(result.title).toBe('42')
  })

  it('falls back to recordId as title when titleFieldId field is absent', () => {
    const result = transformRecord(raw, 'tbl_sprint', { titleFieldId: 99 })
    expect(result.title).toBe('42')
  })

  it('status is always unknown', () => {
    const result = transformRecord(raw, 'tbl_sprint', { titleFieldId: 7 })
    expect(result.status).toBe('unknown')
  })

  it('assigneeIds contains the owner id when owner is an object with id', () => {
    const result = transformRecord(raw, 'tbl_sprint', { titleFieldId: 7 })
    expect(result.assigneeIds).toContain('user1')
  })

  it('assigneeIds is empty when no owner is present', () => {
    const rawNoOwner: RawQuickbaseRecord = {
      '3': { value: 42 },
      '1': { value: '2024-01-15T10:00:00.000Z' },
      '2': { value: '2024-01-16T10:00:00.000Z' },
      '7': { value: 'My Task Title' },
    }
    const result = transformRecord(rawNoOwner, 'tbl_sprint', { titleFieldId: 7 })
    expect(result.assigneeIds).toHaveLength(0)
  })

  it('tagIds is always an empty array', () => {
    const result = transformRecord(raw, 'tbl_sprint', { titleFieldId: 7 })
    expect(result.tagIds).toEqual([])
  })

  it('maps createdAt from FID 1', () => {
    const result = transformRecord(raw, 'tbl_sprint', { titleFieldId: 7 })
    expect(result.createdAt).toBe('2024-01-15T10:00:00.000Z')
  })

  it('maps updatedAt from FID 2', () => {
    const result = transformRecord(raw, 'tbl_sprint', { titleFieldId: 7 })
    expect(result.updatedAt).toBe('2024-01-16T10:00:00.000Z')
  })

  it('platform is quickbase', () => {
    const result = transformRecord(raw, 'tbl_sprint', { titleFieldId: 7 })
    expect(result.platform).toBe('quickbase')
  })

  it('metadata includes platformType as record', () => {
    const result = transformRecord(raw, 'tbl_sprint', { titleFieldId: 7 })
    expect(result.metadata.platformType).toBe('record')
  })

  it('metadata includes scalar field values keyed by field.<fid>', () => {
    const rawWithScalar: RawQuickbaseRecord = {
      '3': { value: 42 },
      '7': { value: 'My Task Title' },
    }
    const result = transformRecord(rawWithScalar, 'tbl_sprint', { titleFieldId: 7 })
    expect(result.metadata['field.7']).toBe('My Task Title')
  })

  it('metadata does not include object values', () => {
    const result = transformRecord(raw, 'tbl_sprint', { titleFieldId: 7 })
    // FID 4 is the owner object — should not appear in metadata
    expect(result.metadata['field.4']).toBeUndefined()
  })

  it('passes TaskSchema.parse', () => {
    const result = transformRecord(raw, 'tbl_sprint', { titleFieldId: 7 })
    expect(() => TaskSchema.parse(result)).not.toThrow()
  })

  it('owner id is resolved from string cell value (non-object owner)', () => {
    const rawStringOwner: RawQuickbaseRecord = {
      '3': { value: 10 },
      '4': { value: 'usr_jane' },
    }
    const result = transformRecord(rawStringOwner, 'tbl_sprint')
    expect(result.assigneeIds).toContain('usr_jane')
  })
})
