import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawKaitenTag,
} from '../../../../../../../src/verticals/projects/adapters/kaiten/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('kaiten transformTag', () => {
  const raw: RawKaitenTag = {
    id: 200,
    name: 'backend',
    // 0xFF5733 = 16734003
    color: 0xff5733,
    company_id: 5,
    created: '2023-06-01T00:00:00.000Z',
    updated: '2024-01-01T00:00:00.000Z',
    archived: false,
  }

  it('maps id as string', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('200')
    expect(result.externalId).toBe('200')
  })

  it('maps name', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('backend')
  })

  it('converts numeric color to hex CSS string', () => {
    const result = transformTag(raw)
    // 0xFF5733 → '#ff5733'
    expect(result.color).toBe('#ff5733')
  })

  it('color is undefined when no color field', () => {
    const result = transformTag({ ...raw, color: undefined })
    expect(result.color).toBeUndefined()
  })

  it('workspaceId is empty string (company-wide tags)', () => {
    const result = transformTag(raw)
    expect(result.workspaceId).toBe('')
  })

  it('platform is kaiten', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('kaiten')
  })

  it('metadata contains companyId and archived', () => {
    const result = transformTag(raw)
    expect(result.metadata.companyId).toBe('5')
    expect(result.metadata.archived).toBe('false')
  })

  it('passes TagSchema.parse', () => {
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})
