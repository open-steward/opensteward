/**
 * Zoho Desk agent → canonical User.
 *
 * Fields from GET /api/v1/agents and GET /api/v1/agents/{agent_id}
 * (https://desk.zoho.com/DeskAPIDocument, Agents): `name`, `firstName`,
 * `lastName`, `emailId`, `rolePermissionType` (AgentPublic, AgentPersonal,
 * AgentTeamPersonal, Admin, Light, Custom), `status`,
 * `associatedDepartmentIds`.
 *
 * An agent payload names departments, not teams (team membership is a
 * separate call, GET /api/v1/agents/{agent_id}/teams), so `teamIds` is empty
 * and the department ids go to metadata.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawZohoDeskAgent {
  id: string | number
  name?: string | null
  firstName?: string | null
  lastName?: string | null
  emailId?: string | null
  rolePermissionType?: string | null
  status?: string | null
  associatedDepartmentIds?: Array<string | number> | null
  [key: string]: unknown
}

function email(v: unknown): string | undefined {
  const s = pickStr(v)?.trim()
  return s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : undefined
}

export function transformUser(raw: RawZohoDeskAgent): User {
  const id = String(raw.id)
  const joined = [pickStr(raw.firstName), pickStr(raw.lastName)].filter(Boolean).join(' ')
  return {
    id,
    externalId: id,
    email: email(raw.emailId),
    name: pickStr(raw.name) || joined || email(raw.emailId) || '',
    role: pickStr(raw.rolePermissionType),
    teamIds: [],
    platform: 'zoho-desk',
    metadata: strMap({
      status: raw.status,
      departmentIds: Array.isArray(raw.associatedDepartmentIds)
        ? raw.associatedDepartmentIds.map(String).join(',')
        : undefined,
    }),
    raw,
  }
}
