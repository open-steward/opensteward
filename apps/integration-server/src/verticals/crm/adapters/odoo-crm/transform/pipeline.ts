import type { Pipeline, PipelineStage } from '../../../schema/pipeline'
import { toIsoDatetime } from '@opensteward/shared'
import { strOrUndef } from '../values'

/**
 * Odoo's pipelines are its sales teams. addons/crm/models/crm_team.py (19.0):
 *
 *   use_opportunities = fields.Boolean('Pipeline', default=True,
 *     help="Check this box to manage a presales process with opportunities.")
 *
 * and a `crm.lead` carries `team_id = fields.Many2one('crm.team', string='Sales Team', …)`.
 * A team's columns are the stages whose `team_ids` is empty or names the team:
 * `crm.lead._read_group_stage_ids` searches `('team_ids', '=', False)` or
 * `('team_ids', 'in', team_ids)`. `crm.stage` is ordered `"sequence, name, id"`.
 *
 * Up to 18.0 a stage has one team instead (addons/crm/models/crm_stage.py,
 * 14.0–18.0): `team_id = fields.Many2one('crm.team', string='Sales Team',
 * ondelete="set null", …)`, with no `team_ids`; 19.0 has only `team_ids`.
 * There `_read_group_stage_ids` searches `('team_id', '=', False)` or
 * `('team_id', '=', team_id)` (crm_lead.py 14.0 and 18.0). Both fields are
 * asked for and the client drops whichever the server lacks.
 */
export interface RawOdooTeam {
  id: number
  name?: string | false
  active?: boolean
  create_date?: string | false
  write_date?: string | false
  [key: string]: unknown
}

export interface RawOdooStage {
  id: number
  name?: string | false
  sequence?: number
  /** `team_ids = fields.Many2many('crm.team', string='Sales Teams', …)`: ids. */
  team_ids?: number[]
  /** 14.0–18.0: `team_id = fields.Many2one('crm.team', …)`: [id, name] or false. */
  team_id?: [number, string] | false
  [key: string]: unknown
}

export const TEAM_FIELDS = ['id', 'name', 'active', 'create_date', 'write_date']
export const STAGE_FIELDS = ['id', 'name', 'sequence', 'team_ids', 'team_id']
/** `crm.stage._order`. */
export const STAGE_ORDER = 'sequence, name, id'

/** The stages a team's pipeline shows, in `stages`' order (fetch with {@link STAGE_ORDER}). */
function stagesOf(teamId: number, stages: readonly RawOdooStage[]): PipelineStage[] {
  return stages
    .filter((s) => {
      if (Array.isArray(s.team_ids)) return s.team_ids.length === 0 || s.team_ids.includes(teamId)
      if (Array.isArray(s.team_id)) return s.team_id[0] === teamId
      return true
    })
    .map((s, index) => {
      const name = strOrUndef(s.name)
      if (!name) throw new Error(`Odoo crm.stage ${s.id} has no name`)
      return { id: String(s.id), name, order: index }
    })
}

export function transformPipeline(team: RawOdooTeam, stages: readonly RawOdooStage[]): Pipeline {
  const name = strOrUndef(team.name)
  if (!name) throw new Error(`Odoo crm.team ${team.id} has no name`)
  return {
    id: String(team.id),
    name,
    is_active: typeof team.active === 'boolean' ? team.active : undefined,
    stages: stagesOf(team.id, stages),
    created_at: toIsoDatetime(strOrUndef(team.create_date)),
    updated_at: toIsoDatetime(strOrUndef(team.write_date)),
    metadata: team,
  }
}
