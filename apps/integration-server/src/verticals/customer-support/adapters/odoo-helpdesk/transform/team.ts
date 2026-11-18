import type { Team } from '../../../schema'
import { meta, strOrUndef } from '../values'

/**
 * A `helpdesk.team` row. Helpdesk is closed source (Odoo Enterprise only);
 * both field names are ones Odoo sets on helpdesk.team records in its own
 * data, github.com/odoo/industry branch 19.0: `name`
 * (bike_shop/data/helpdesk_team.xml, "Warranties / After-Sales / SAV") and
 * `active` (the same file archives `helpdesk.helpdesk_team1` with
 * `<field name="active" eval="False" />`).
 *
 * Team membership is not read (no public source names its field), so
 * `memberCount` is absent.
 */
export interface RawOdooTeam {
  id: number
  name?: string | false
  active?: boolean
  [key: string]: unknown
}

export const TEAM_FIELDS = ['id', 'name', 'active']

export function transformTeam(raw: RawOdooTeam): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: strOrUndef(raw.name) ?? '',
    platform: 'odoo-helpdesk',
    metadata: meta({
      active: typeof raw.active === 'boolean' ? String(raw.active) : undefined,
    }),
    raw,
  }
}
