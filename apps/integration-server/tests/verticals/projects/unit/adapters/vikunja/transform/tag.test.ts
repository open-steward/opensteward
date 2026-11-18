import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawVikunjaLabel,
} from '../../../../../../../src/verticals/projects/adapters/vikunja/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('vikunja transformTag', () => {
  const raw: RawVikunjaLabel = {
    id: 7,
    title: 'Bug',
    description: 'Something is broken',
    hex_color: '#e11d48',
    created_by: {
      id: 3,
      username: 'bob',
      name: 'Bob',
    },
    created: '2024-02-01T08:00:00.000Z',
    updated: '2024-02-15T09:00:00.000Z',
  }

  it('maps id and externalId from numeric id', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('7')
    expect(result.externalId).toBe('7')
  })

  it('maps name from title', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('Bug')
  })

  it('maps color from hex_color', () => {
    const result = transformTag(raw)
    expect(result.color).toBe('#e11d48')
  })

  it('workspaceId is sentinel "0" (vikunja labels are not workspace-scoped)', () => {
    const result = transformTag(raw)
    expect(result.workspaceId).toBe('0')
  })

  it('platform is vikunja', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('vikunja')
  })

  it('metadata contains description', () => {
    const result = transformTag(raw)
    expect(result.metadata.description).toBe('Something is broken')
  })

  it('metadata contains createdByUsername', () => {
    const result = transformTag(raw)
    expect(result.metadata.createdByUsername).toBe('bob')
  })

  it('color is undefined when hex_color is absent', () => {
    const r: RawVikunjaLabel = { id: 8 }
    const result = transformTag(r)
    expect(result.color).toBeUndefined()
  })

  it('name is empty string when title is absent', () => {
    const r: RawVikunjaLabel = { id: 9 }
    const result = transformTag(r)
    expect(result.name).toBe('')
  })

  it('passes TagSchema.parse', () => {
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})
