import { describe, it, expect } from 'vitest'
import { transformProject } from '../../../../../../../src/verticals/projects/adapters/teamhood/transform/project'
import { ProjectSchema } from '../../../../../../../src/verticals/projects/schema/project'
import { DOC_BOARDS_RESPONSE } from '../fixtures'

describe('teamhood transformProject (documented Entities.Board example)', () => {
  const board = DOC_BOARDS_RESPONSE.boards[0]!

  it('parses with ProjectSchema and maps the documented fields', () => {
    const p = ProjectSchema.parse(transformProject(board, 'ws-1'))
    expect(p).toMatchObject({
      id: 'bb98ce99-391c-4746-9ef6-5558bf9fa41f',
      externalId: 'bb98ce99-391c-4746-9ef6-5558bf9fa41f',
      workspaceId: 'ws-1',
      name: 'Board title',
      platform: 'teamhood',
      metadata: { displayId: 'BRD1' },
    })
  })

  it("reports status 'unknown': a board documents no status", () => {
    expect(transformProject(board, 'ws-1').status).toBe('unknown')
  })

  it('keeps isPrivate in metadata when present', () => {
    expect(transformProject({ ...board, isPrivate: true }, 'ws-1').metadata['isPrivate']).toBe(
      'true',
    )
  })
})
