import type { Ticket, TicketPriority } from '../../../schema'
import { many2oneId, many2oneName, meta, odooIso, strOrUndef, type Many2one } from '../values'

/**
 * A `helpdesk.ticket` row as `search_read` / `read` returns it for
 * {@link TICKET_FIELDS}.
 *
 * Helpdesk is Odoo Enterprise only ("``helpdesk.ticket`` in the Helpdesk
 * (*helpdesk* - Odoo Enterprise only) Application", odoo/documentation 19.0
 * content/developer/reference/backend/mixins.rst) and its source is not
 * public. Every field name below is one Odoo itself sets on helpdesk.ticket
 * records in its own demo data, github.com/odoo/industry branch 19.0:
 *   name, partner_id, partner_name, stage_id, team_id, description
 *       bike_leasing/demo/helpdesk_ticket.xml, electronic_store/demo/helpdesk_ticket.xml
 *   user_id (ref base.user_admin), priority ("2"), ticket_ref ("01")
 *       bike_shop/demo/helpdesk_ticket.xml
 *   assign_date, close_date
 *       electronic_store/demo/helpdesk_ticket.xml
 * plus the log-access columns `create_date` / `write_date` ("Stores when the
 * record was created / last updated, Datetime", 19.0 ORM reference).
 *
 * The shared client reads only the fields `fields_get` reports, so any of
 * these can be absent from a row; every one is optional here.
 */
export interface RawOdooTicket {
  id: number
  name?: string | false
  ticket_ref?: string | false
  partner_id?: Many2one
  partner_name?: string | false
  user_id?: Many2one
  team_id?: Many2one
  stage_id?: Many2one
  priority?: string | false
  assign_date?: string | false
  close_date?: string | false
  create_date?: string | false
  write_date?: string | false
  [key: string]: unknown
}

export const TICKET_FIELDS = [
  'id',
  'name',
  'ticket_ref',
  'partner_id',
  'partner_name',
  'user_id',
  'team_id',
  'stage_id',
  'priority',
  'assign_date',
  'close_date',
  'create_date',
  'write_date',
]

/**
 * "The priority levels are represented by stars: 0 stars = Low Priority,
 * 1 star = Medium Priority, 2 stars = High Priority, 3 stars = Urgent"
 * (odoo/documentation 19.0, applications/services/helpdesk/overview/
 * receiving_tickets.rst). The stored value is the star count as a string
 * (`<field name="priority">2</field>`, odoo/industry bike_shop demo).
 */
const PRIORITY: Record<string, TicketPriority> = {
  '0': 'low',
  '1': 'normal',
  '2': 'high',
  '3': 'urgent',
}

/**
 * Odoo has no ticket status field: a ticket sits in a team-defined stage, and
 * "when the issue is solved, the ticket is moved to a *folded* stage. This
 * marks the ticket as *closed*" (helpdesk/advanced/close_tickets.rst, 19.0).
 * Stage names are the customer's own, so the only status read is closed —
 * a ticket with a `close_date` — and everything else is open. The stage name
 * is kept in metadata.
 */
export function transformTicket(raw: RawOdooTicket): Ticket {
  const closedAt = odooIso(raw.close_date)
  const priority = strOrUndef(raw.priority)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: strOrUndef(raw.ticket_ref),
    subject: strOrUndef(raw.name) ?? '',
    status: closedAt ? 'closed' : 'open',
    priority: priority ? PRIORITY[priority] : undefined,
    // Odoo records no intake channel on the ticket (email alias, live chat
    // and website form all create the same record).
    channel: 'unknown',
    requesterId: many2oneId(raw.partner_id) ?? '',
    assigneeId: many2oneId(raw.user_id),
    teamId: many2oneId(raw.team_id),
    tagIds: [],
    createdAt: odooIso(raw.create_date) ?? new Date(0).toISOString(),
    updatedAt: odooIso(raw.write_date),
    closedAt,
    platform: 'odoo-helpdesk',
    metadata: meta({
      stageId: many2oneId(raw.stage_id),
      stage: many2oneName(raw.stage_id),
      team: many2oneName(raw.team_id),
      requesterName: many2oneName(raw.partner_id) ?? strOrUndef(raw.partner_name),
      rawPriority: priority,
      assignedAt: odooIso(raw.assign_date),
    }),
    raw,
  }
}
