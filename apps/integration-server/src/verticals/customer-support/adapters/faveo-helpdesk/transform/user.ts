/**
 * Transform a Faveo Helpdesk v3 agent/admin record into the canonical User.
 *
 * Source: GET v3/api/admin/get-agent/{agentId}
 * https://developers.faveohelpdesk.com/get-agent-admin/ — documented record:
 *   "id": 101, "user_name": "krishna", "role": "agent", "email": "krishna@faveo.com",
 *   "active": 1, "departments": [{ "id": 1, "name": "Support" }, ...],
 *   "teams": [{ "id": 1, "name": "Level 1 Support" }, ...], "name": "Krishna Vishwakarma"
 */
import { z } from 'zod'
import type { User } from '../../../schema'

interface IdName {
  id: number
  name?: string | null
}

export interface RawFaveoAgent {
  id: number
  name: string
  user_name?: string | null
  role?: string | null
  email?: string | null
  active?: number | null
  departments?: IdName[] | null
  teams?: IdName[] | null
  [key: string]: unknown
}

const Email = z.email()

export function transformUser(raw: RawFaveoAgent): User {
  if (typeof raw.name !== 'string') {
    throw new Error(`faveo-helpdesk: agent ${raw.id} has no name`)
  }
  const email = Email.safeParse(raw.email).success ? (raw.email as string) : undefined
  const metadata: Record<string, string> = {}
  if (raw.user_name) metadata['userName'] = raw.user_name
  if (typeof raw.active === 'number') metadata['active'] = String(raw.active)
  if (Array.isArray(raw.departments) && raw.departments.length > 0) {
    metadata['departmentIds'] = raw.departments.map((d) => String(d.id)).join(',')
  }
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ...(email ? { email } : {}),
    name: raw.name,
    ...(raw.role ? { role: raw.role } : {}),
    teamIds: Array.isArray(raw.teams) ? raw.teams.map((t) => String(t.id)) : [],
    platform: 'faveo-helpdesk',
    metadata,
    raw,
  }
}
