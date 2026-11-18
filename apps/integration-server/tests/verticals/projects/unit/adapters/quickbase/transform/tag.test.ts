import { describe, it, expect } from 'vitest'
import {
  transformField,
  type RawQuickbaseField,
} from '../../../../../../../src/verticals/projects/adapters/quickbase/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('quickbase transformField', () => {
  const raw: RawQuickbaseField = {
    id: 7,
    label: 'Priority',
    fieldType: 'text',
    mode: '',
    required: false,
    unique: false,
  }

  it('id is String(raw.id)', () => {
    const result = transformField(raw, 'tbl_abc')
    expect(result.id).toBe('7')
  })

  it('externalId equals id', () => {
    const result = transformField(raw, 'tbl_abc')
    expect(result.externalId).toBe('7')
  })

  it('maps name from raw.label', () => {
    const result = transformField(raw, 'tbl_abc')
    expect(result.name).toBe('Priority')
  })

  it('maps workspaceId from tableId argument', () => {
    const result = transformField(raw, 'tbl_abc')
    expect(result.workspaceId).toBe('tbl_abc')
  })

  it('workspaceId is empty string when tableId is omitted', () => {
    const result = transformField(raw)
    expect(result.workspaceId).toBe('')
  })

  it('platform is quickbase', () => {
    const result = transformField(raw, 'tbl_abc')
    expect(result.platform).toBe('quickbase')
  })

  it('metadata includes fieldType', () => {
    const result = transformField(raw, 'tbl_abc')
    expect(result.metadata.fieldType).toBe('text')
  })

  it('metadata includes mode when non-empty', () => {
    const rawWithMode: RawQuickbaseField = { ...raw, mode: 'lookup' }
    const result = transformField(rawWithMode, 'tbl_abc')
    expect(result.metadata.mode).toBe('lookup')
  })

  it('metadata includes required as string', () => {
    const rawRequired: RawQuickbaseField = { ...raw, required: true }
    const result = transformField(rawRequired, 'tbl_abc')
    expect(result.metadata.required).toBe('true')
  })

  it('metadata includes unique as string', () => {
    const rawUnique: RawQuickbaseField = { ...raw, unique: true }
    const result = transformField(rawUnique, 'tbl_abc')
    expect(result.metadata.unique).toBe('true')
  })

  it('name is empty string when raw.label is absent', () => {
    const result = transformField({ id: 7 })
    expect(result.name).toBe('')
  })

  it('passes TagSchema.parse', () => {
    const result = transformField(raw, 'tbl_abc')
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})
