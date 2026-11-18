import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawSeatableProject,
} from '../../../../../../../src/verticals/projects/adapters/seatable/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

/** First base of the documented GET /api/v2.1/user-admin-dtables/ example. */
const raw: RawSeatableProject = {
  id: 562,
  workspace_id: 204,
  uuid: '12345678-fd55-48e4-8c4a-5fd6f2549765',
  name: 'All types',
  creator: 'Michael Jackson',
  modifier: 'Michael Jackson',
  created_at: '2021-06-21T14:52:11+00:00',
  updated_at: '2021-10-18T08:47:02+00:00',
  color: null,
  text_color: null,
  icon: null,
}

describe('seatable transformProject', () => {
  it('maps the documented example and passes ProjectSchema.parse', () => {
    const result = ProjectSchema.parse(transformProject(raw))
    expect(result).toMatchObject({
      id: '12345678-fd55-48e4-8c4a-5fd6f2549765',
      externalId: '12345678-fd55-48e4-8c4a-5fd6f2549765',
      workspaceId: '204',
      name: 'All types',
      status: 'unknown',
      createdAt: '2021-06-21T14:52:11.000Z',
      updatedAt: '2021-10-18T08:47:02.000Z',
      platform: 'seatable',
      metadata: { intId: '562', creator: 'Michael Jackson', modifier: 'Michael Jackson' },
    })
  })

  it('does not treat the creator display name as an owner id', () => {
    expect(transformProject(raw).ownerId).toBeUndefined()
  })

  it('throws instead of inventing an id when uuid is absent', () => {
    const { uuid: _uuid, ...noUuid } = raw
    expect(() => transformProject(noUuid)).toThrow(/uuid/)
  })

  it('throws instead of inventing a workspace when workspace_id is absent', () => {
    const { workspace_id: _ws, ...noWs } = raw
    expect(() => transformProject(noWs)).toThrow(/workspace_id/)
  })
})
