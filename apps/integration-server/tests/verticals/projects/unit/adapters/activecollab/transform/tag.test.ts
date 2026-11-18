import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawActivecollabLabel,
} from '../../../../../../../src/verticals/projects/adapters/activecollab/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('activecollab transformTag', () => {
  const raw: RawActivecollabLabel = {
    id: 7,
    name: 'Bug',
    color: '#FF0000',
    class: 'TaskLabel',
    is_default: false,
    is_global: true,
    position: 1,
  }

  it('maps id and externalId from numeric id', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('7')
    expect(result.externalId).toBe('7')
  })

  it('workspaceId is empty string (labels are account-global)', () => {
    const result = transformTag(raw)
    expect(result.workspaceId).toBe('')
  })

  it('maps name', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('Bug')
  })

  it('maps color hex string', () => {
    const result = transformTag(raw)
    expect(result.color).toBe('#FF0000')
  })

  it('platform is activecollab', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('activecollab')
  })

  it('metadata.class reflects the label class', () => {
    const result = transformTag(raw)
    expect(result.metadata.class).toBe('TaskLabel')
  })

  it('metadata.isGlobal is set', () => {
    const result = transformTag(raw)
    expect(result.metadata.isGlobal).toBe('true')
  })

  it('passes TagSchema.parse', () => {
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })

  it('color is undefined when absent', () => {
    const result = transformTag({ id: 1, name: 'Feature' })
    expect(result.color).toBeUndefined()
  })

  it('name falls back to empty string when absent', () => {
    const result = transformTag({ id: 1 })
    expect(result.name).toBe('')
  })
})
