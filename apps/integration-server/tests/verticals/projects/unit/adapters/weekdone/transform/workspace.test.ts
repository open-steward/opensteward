import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawWeekdoneTeam,
} from '../../../../../../../src/verticals/projects/adapters/weekdone/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('weekdone transformWorkspace', () => {
  const raw: RawWeekdoneTeam = {
    id: 9,
    name: 'Engineering',
    privacy: 1,
    external_reports: 'disabled',
  }

  it('id is stringified team id', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('9')
  })

  it('externalId equals id', () => {
    const result = transformWorkspace(raw)
    expect(result.externalId).toBe('9')
  })

  it('name maps from name field', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Engineering')
  })

  it('name is empty string when absent', () => {
    const result = transformWorkspace({ id: 1 })
    expect(result.name).toBe('')
  })

  it('platform is weekdone', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('weekdone')
  })

  it('metadata contains privacy value', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.privacy).toBe('1')
  })

  it('metadata contains externalReports value', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.externalReports).toBe('disabled')
  })

  it('metadata omits undefined privacy', () => {
    const result = transformWorkspace({ id: 1 })
    expect(result.metadata.privacy).toBeUndefined()
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })

  it('passes WorkspaceSchema.parse with minimal input', () => {
    const result = transformWorkspace({ id: 1 })
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })
})
