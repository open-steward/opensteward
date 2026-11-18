/**
 * FreeScout mailbox -> canonical Team transform.
 *
 * FreeScout does not have a "teams" resource.  The closest structural
 * equivalent is a Mailbox (an inbox that agents are assigned to).
 *
 * GET /api/mailboxes returns:
 *   id, name, email, type, status, userId (owner), createdAt, updatedAt
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawFreescoutMailbox {
  id: number
  name?: string | null
  email?: string | null
  type?: string | null
  status?: number | null
  userId?: number | null
  [key: string]: unknown
}

export function transformTeam(raw: RawFreescoutMailbox): Team {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'freescout',
    metadata: strMap({ email: raw.email, type: raw.type }),
    raw,
  }
}
