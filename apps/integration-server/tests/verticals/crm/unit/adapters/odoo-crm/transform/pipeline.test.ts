/** Fixtures follow Odoo's documented read format; see contact.test.ts. */
import { describe, it, expect } from 'vitest'
import { PipelineSchema } from '../../../../../../../src/verticals/crm/schema/pipeline'
import {
  transformPipeline,
  type RawOdooStage,
  type RawOdooTeam,
} from '../../../../../../../src/verticals/crm/adapters/odoo-crm/transform/pipeline'

const TEAM: RawOdooTeam = {
  id: 1,
  name: 'Sales',
  active: true,
  create_date: '2026-01-01 08:00:00',
  write_date: '2026-01-02 08:00:00',
}

// In crm.stage order ("sequence, name, id").
const STAGES: RawOdooStage[] = [
  { id: 1, name: 'New', sequence: 1, team_ids: [] },
  { id: 5, name: 'Pitch', sequence: 2, team_ids: [2] },
  { id: 2, name: 'Qualified', sequence: 2, team_ids: [1, 2] },
  { id: 4, name: 'Won', sequence: 70, team_ids: [] },
]

describe('odoo-crm transformPipeline', () => {
  it('maps a crm.team onto a pipeline of the stages it shows', () => {
    const out = PipelineSchema.parse(transformPipeline(TEAM, STAGES))
    expect(out).toMatchObject({
      id: '1',
      name: 'Sales',
      is_active: true,
      created_at: '2026-01-01T08:00:00.000Z',
      updated_at: '2026-01-02T08:00:00.000Z',
    })
    // Shared stages (no team) and the team's own; not team 2's.
    expect(out.stages).toEqual([
      { id: '1', name: 'New', order: 0 },
      { id: '2', name: 'Qualified', order: 1 },
      { id: '4', name: 'Won', order: 2 },
    ])
  })

  it('another team gets its own columns', () => {
    const out = PipelineSchema.parse(transformPipeline({ ...TEAM, id: 2, name: 'Website' }, STAGES))
    expect(out.stages?.map((s) => s.id)).toEqual(['1', '5', '2', '4'])
  })

  it('throws rather than inventing a pipeline name', () => {
    expect(() => transformPipeline({ id: 3, name: false }, [])).toThrow(/no name/)
  })
})
