import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawOutlookCategory,
} from '../../../../../../../src/verticals/projects/adapters/microsoft-todo/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('microsoft-todo transformTag (Outlook category)', () => {
  const raw: RawOutlookCategory = {
    id: 'cat-guid-001',
    displayName: 'Urgent',
    color: 'preset0',
  }

  it('maps id and externalId from raw.id', () => {
    const result = transformTag(raw)
    expect(result.id).toBe('cat-guid-001')
    expect(result.externalId).toBe('cat-guid-001')
  })

  it('maps name from displayName', () => {
    const result = transformTag(raw)
    expect(result.name).toBe('Urgent')
  })

  it('maps preset0 color to #e74c3c', () => {
    const result = transformTag(raw)
    expect(result.color).toBe('#e74c3c')
  })

  it('maps preset7 color to #3498db', () => {
    const result = transformTag({ ...raw, color: 'preset7' })
    expect(result.color).toBe('#3498db')
  })

  it('color is undefined when color is None', () => {
    const result = transformTag({ ...raw, color: 'None' })
    expect(result.color).toBeUndefined()
  })

  it('color is undefined when color is absent', () => {
    const result = transformTag({ id: 'cat-2', displayName: 'Work' })
    expect(result.color).toBeUndefined()
  })

  it('workspaceId defaults to "me"', () => {
    const result = transformTag(raw)
    expect(result.workspaceId).toBe('me')
  })

  it('caller can supply a custom workspaceId', () => {
    const result = transformTag(raw, 'user-guid-abc')
    expect(result.workspaceId).toBe('user-guid-abc')
  })

  it('platform is microsoft-todo', () => {
    const result = transformTag(raw)
    expect(result.platform).toBe('microsoft-todo')
  })

  it('passes TagSchema.parse', () => {
    const result = transformTag(raw)
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})
