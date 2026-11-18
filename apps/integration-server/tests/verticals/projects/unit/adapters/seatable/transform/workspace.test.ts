import { describe, it, expect } from 'vitest'
import {
  transformWorkspace,
  type RawSeatableWorkspace,
} from '../../../../../../../src/verticals/projects/adapters/seatable/transform/workspace'
import { WorkspaceSchema } from '../../../../../../../src/verticals/projects/schema/workspace'

/** From the documented GET /api/v2.1/workspaces/ "with detail=false" example. */
const raw: RawSeatableWorkspace = { id: 5, name: 'my group', type: 'group' }

describe('seatable transformWorkspace', () => {
  it('maps the documented example and passes WorkspaceSchema.parse', () => {
    const result = WorkspaceSchema.parse(transformWorkspace(raw))
    expect(result).toMatchObject({
      id: '5',
      externalId: '5',
      name: 'my group',
      platform: 'seatable',
      metadata: { type: 'group' },
    })
  })

  it('name is empty string when name is absent', () => {
    expect(transformWorkspace({ id: 9 }).name).toBe('')
  })

  it('throws on the documented starred/shared entries, whose id is ""', () => {
    expect(() => transformWorkspace({ id: '', name: 'starred', type: 'starred' })).toThrow(/no id/)
  })
})
