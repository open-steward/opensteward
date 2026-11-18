/**
 * The fixture is the documented example of "Get list of boards"
 * (GET /spaces/{space_id}/boards, https://developers.kaiten.ru/space-boards/get-list-of-boards),
 * trimmed of the columns/lanes/card_properties the transform does not read.
 */
import { describe, it, expect } from 'vitest'
import {
  transformProject,
  type RawKaitenBoard,
} from '../../../../../../../src/verticals/projects/adapters/kaiten/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'

const raw: RawKaitenBoard = {
  created: '2014-11-05T09:28:16.024Z',
  updated: '2021-08-27T14:01:30.049Z',
  id: 1,
  title: '3 classes of service123x',
  external_id: null,
  default_card_type_id: 1,
  description: 'sdafasdf\n',
  email_key: '7a977fb1acbd4aa4',
  space_id: 1,
  board_id: 1,
  top: 8,
  left: 1560,
  sort_order: 3224.547725463922,
  type: 1,
}

describe('kaiten transformProject', () => {
  it('maps the documented board fields and parses as a Project', () => {
    const result = ProjectSchema.parse(transformProject(raw, { id: 1, archived: false }))
    expect(result).toMatchObject({
      id: '1',
      externalId: '1',
      workspaceId: '1',
      name: '3 classes of service123x',
      description: 'sdafasdf\n',
      status: 'active',
      createdAt: '2014-11-05T09:28:16.024Z',
      updatedAt: '2021-08-27T14:01:30.049Z',
      platform: 'kaiten',
      metadata: { spaceId: '1' },
    })
  })

  it('takes workspaceId from the documented space_id', () => {
    expect(transformProject({ ...raw, space_id: 55 }).workspaceId).toBe('55')
  })

  it('status is archived when the parent space is archived', () => {
    expect(ProjectSchema.parse(transformProject(raw, { id: 1, archived: true })).status).toBe(
      'archived',
    )
  })

  it('status is unknown when the parent space is not known', () => {
    expect(ProjectSchema.parse(transformProject(raw)).status).toBe('unknown')
  })

  it('throws rather than inventing a workspace when space_id is absent', () => {
    const { space_id: _drop, ...noSpace } = raw
    expect(() => transformProject(noSpace as RawKaitenBoard)).toThrow(/space_id/)
  })

  it('a string external_id (documented "null | string") lands in metadata.externalId', () => {
    const result = ProjectSchema.parse(
      transformProject({ ...raw, external_id: 'ext-42' }, { id: 1, archived: false }),
    )
    expect(result.metadata).toEqual({ spaceId: '1', externalId: 'ext-42' })
  })

  it('a null description is omitted', () => {
    expect(transformProject({ ...raw, description: null }).description).toBeUndefined()
  })
})
