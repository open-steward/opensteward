import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawSpacesTag,
} from '../../../../../../../src/verticals/projects/adapters/teamwork-desk/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('teamwork-desk transformTag', () => {
  const raw: RawSpacesTag = {
    id: 88,
    name: 'onboarding',
    color: '#22c55e',
    pageCount: 5,
    createdAt: '2024-01-05T00:00:00.000Z',
    updatedAt: '2024-02-10T00:00:00.000Z',
    createdBy: { id: 10, type: 'person' },
  }

  it('maps id and externalId from raw.id as string', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('88')
    expect(result.externalId).toBe('88')
  })

  it('maps name correctly', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('onboarding')
  })

  it('maps color correctly', () => {
    const result = transformTag(raw)
    expect(result.color).toBe('#22c55e')
  })

  it('workspaceId is always empty string (installation-scoped)', () => {
    const result = transformTag(raw)
    expect(result.workspaceId).toBe('')
  })

  it('platform is teamwork-desk', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('teamwork-desk')
  })

  it('metadata stores pageCount as string', () => {
    const result = transformTag(raw)
    expect(result.metadata['pageCount']).toBe('5')
  })

  it('passes TagSchema.parse', () => {
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})
