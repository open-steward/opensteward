import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type RawNextcloudDeckLabel,
} from '../../../../../../../src/verticals/projects/adapters/nextcloud-deck/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('nextcloud-deck transformLabel', () => {
  const raw: RawNextcloudDeckLabel = {
    id: 77,
    title: 'Bug',
    color: 'ff0000',
    boardId: 12,
  }

  it('id is compound boardId/labelId', () => {
    const result = transformLabel(raw)
    expect(result.id).toBe('12/77')
  })

  it('workspaceId provided overrides raw.boardId in compound id', () => {
    const result = transformLabel(raw, '99')
    expect(result.id).toBe('99/77')
    expect(result.workspaceId).toBe('99')
  })

  it('externalId is the bare label id', () => {
    const result = transformLabel(raw)
    expect(result.externalId).toBe('77')
  })

  it('workspaceId is the boardId string when no override', () => {
    const result = transformLabel(raw)
    expect(result.workspaceId).toBe('12')
  })

  it('maps name from title', () => {
    const result = transformLabel(raw)
    expect(result.name).toBe('Bug')
  })

  it('maps color from color field', () => {
    const result = transformLabel(raw)
    expect(result.color).toBe('ff0000')
  })

  it('platform is nextcloud-deck', () => {
    const result = transformLabel(raw)
    expect(result.platform).toBe('nextcloud-deck')
  })

  it('passes TagSchema.parse', () => {
    const result = transformLabel(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})
