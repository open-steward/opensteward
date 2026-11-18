import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type RawWekanLabel,
} from '../../../../../../../src/verticals/projects/adapters/wekan/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('wekan transformLabel', () => {
  const raw: RawWekanLabel = {
    _id: 'label-9',
    name: 'bug',
    color: 'red',
  }
  const boardId = 'board-42'

  it('maps id and externalId from _id', () => {
    const result = transformLabel(raw, boardId)
    expect(result.id).toBe('label-9')
    expect(result.externalId).toBe('label-9')
  })

  it('maps name', () => {
    const result = transformLabel(raw, boardId)
    expect(result.name).toBe('bug')
  })

  it('uses boardId as workspaceId', () => {
    const result = transformLabel(raw, boardId)
    expect(result.workspaceId).toBe('board-42')
  })

  it('maps color', () => {
    const result = transformLabel(raw, boardId)
    expect(result.color).toBe('red')
  })

  it('platform is wekan', () => {
    const result = transformLabel(raw, boardId)
    expect(result.platform).toBe('wekan')
  })

  it('color is undefined when absent', () => {
    const result = transformLabel({ ...raw, color: undefined }, boardId)
    expect(result.color).toBeUndefined()
  })

  it('passes TagSchema.parse', () => {
    const result = transformLabel(raw, boardId)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})
