import { describe, it, expect } from 'vitest'
import {
  transformTag,
  type RawZohoBugtrackerTag,
} from '../../../../../../../src/verticals/projects/adapters/zoho-bugtracker/transform/tag'
import { TagSchema } from '../../../../../../../src/verticals/projects/schema/tag'

describe('zoho-bugtracker transformTag', () => {
  const raw: RawZohoBugtrackerTag = {
    id: 101,
    id_string: 'tag-101',
    name: 'regression',
    color_class: 'tag_color3',
    created_by: {
      id: '55',
      zpuid: '999',
      name: 'Alice',
      email: 'alice@example.com',
      is_client_user: false,
    },
  }

  it('uses id_string as id when present', () => {
    const result = transformTag(raw, 'portal-1')
    expect(result.id).toBe('tag-101')
    expect(result.externalId).toBe('tag-101')
  })

  it('falls back to string of numeric id when id_string absent', () => {
    const result = transformTag({ ...raw, id_string: undefined }, 'portal-1')
    expect(result.id).toBe('101')
  })

  it('maps name', () => {
    const result = transformTag(raw, 'portal-1')
    expect(result.name).toBe('regression')
  })

  it('name is empty string when absent', () => {
    const result = transformTag({ ...raw, name: undefined }, 'portal-1')
    expect(result.name).toBe('')
  })

  it('maps color from color_class', () => {
    const result = transformTag(raw, 'portal-1')
    expect(result.color).toBe('tag_color3')
  })

  it('color is undefined when color_class absent', () => {
    const result = transformTag({ ...raw, color_class: undefined }, 'portal-1')
    expect(result.color).toBeUndefined()
  })

  it('maps workspaceId from required portalId argument', () => {
    const result = transformTag(raw, 'portal-42')
    expect(result.workspaceId).toBe('portal-42')
  })

  it('platform is zoho-bugtracker', () => {
    const result = transformTag(raw, 'portal-1')
    expect(result.platform).toBe('zoho-bugtracker')
  })

  it('metadata includes colorClass, createdByName, createdById', () => {
    const result = transformTag(raw, 'portal-1')
    expect(result.metadata.colorClass).toBe('tag_color3')
    expect(result.metadata.createdByName).toBe('Alice')
    expect(result.metadata.createdById).toBe('55')
  })

  it('passes TagSchema.parse', () => {
    const result = transformTag(raw, 'portal-1')
    expect(() => TagSchema.parse(result)).not.toThrow()
  })
})
