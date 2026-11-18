import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawOraLabel,
} from '../../../../../../../src/verticals/projects/adapters/ora/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('ora transformTag', () => {
  const raw: RawOraLabel = {
    id: 'lbl_7',
    name: 'Bug',
    color: '#FF0000',
    project_id: 'proj_55',
  }

  it('maps id and name', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('lbl_7')
    expect(result.name).toBe('Bug')
  })

  it('maps color', () => {
    const result = transformTag(raw)
    expect(result.color).toBe('#FF0000')
  })

  it('uses project_id as workspaceId when present', () => {
    const result = transformTag(raw)
    expect(result.workspaceId).toBe('proj_55')
  })

  it('falls back to workspaceId arg when project_id is absent', () => {
    const result = transformTag({ id: 1, name: 'Feature' }, 'ws_fallback')
    expect(result.workspaceId).toBe('ws_fallback')
  })

  it('workspaceId is empty string when neither project_id nor arg provided', () => {
    const result = transformTag({ id: 1, name: 'Feature' })
    expect(result.workspaceId).toBe('')
  })

  it('platform is ora', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('ora')
  })

  it('name defaults to empty string when absent', () => {
    const result = transformTag({ id: 1 })
    expect(result.name).toBe('')
  })

  it('passes TagSchema.parse', () => {
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})
