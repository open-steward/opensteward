import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawKaitenSpace,
} from '../../../../../../../src/verticals/projects/adapters/kaiten/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

describe('kaiten transformWorkspace', () => {
  const raw: RawKaitenSpace = {
    id: 55,
    uid: 'space-uid-abc',
    title: 'Engineering Space',
    created: '2022-01-01T00:00:00.000Z',
    updated: '2024-01-01T00:00:00.000Z',
    archived: false,
    access: 'open',
    company_id: 5,
    entity_type: 'space',
    sort_order: 1,
    boards: [
      { id: 101, title: 'Dev Board' },
      { id: 102, title: 'QA Board' },
    ],
  }

  it('maps id as string', () => {
    const result = transformWorkspace(raw)
    expect(result.id).toBe('55')
    expect(result.externalId).toBe('55')
  })

  it('maps title to name', () => {
    const result = transformWorkspace(raw)
    expect(result.name).toBe('Engineering Space')
  })

  it('platform is kaiten', () => {
    const result = transformWorkspace(raw)
    expect(result.platform).toBe('kaiten')
  })

  it('metadata contains uid, access, companyId, entityType', () => {
    const result = transformWorkspace(raw)
    expect(result.metadata.uid).toBe('space-uid-abc')
    expect(result.metadata.access).toBe('open')
    expect(result.metadata.companyId).toBe('5')
    expect(result.metadata.entityType).toBe('space')
  })

  it('passes WorkspaceSchema.parse', () => {
    const result = transformWorkspace(raw)
    expect(() => WorkspaceSchema.parse(result)).not.toThrow()
  })

  it('name is empty string when title absent', () => {
    const result = transformWorkspace({ id: 1 })
    expect(result.name).toBe('')
  })
})
