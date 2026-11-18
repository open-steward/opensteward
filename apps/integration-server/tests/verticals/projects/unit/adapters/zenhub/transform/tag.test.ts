import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawZenhubLabel,
} from '../../../../../../../src/verticals/projects/adapters/zenhub/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('zenhub transformTag', () => {
  const raw: RawZenhubLabel = {
    id: 'label-1',
    name: 'bug',
    color: 'ee0701',
  }

  it('maps id and externalId', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('label-1')
    expect(result.externalId).toBe('label-1')
  })

  it('maps name', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('bug')
  })

  it('name is empty string when absent', () => {
    const result = transformTag({ ...raw, name: undefined })
    expect(result.name).toBe('')
  })

  it('maps color', () => {
    const result = transformTag(raw)
    expect(result.color).toBe('ee0701')
  })

  it('color is undefined when absent', () => {
    const result = transformTag({ ...raw, color: undefined })
    expect(result.color).toBeUndefined()
  })

  it('maps workspaceId from repositoryId argument', () => {
    const result = transformTag(raw, 'repo-42')
    expect(result.workspaceId).toBe('repo-42')
  })

  it('workspaceId is empty string when repositoryId absent', () => {
    const result = transformTag(raw)
    expect(result.workspaceId).toBe('')
  })

  it('platform is zenhub', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('zenhub')
  })

  it('passes TagSchema.parse', () => {
    const result = transformTag(raw, 'repo-42')
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})
