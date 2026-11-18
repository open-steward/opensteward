/**
 * Comm100 agents → canonical Users.
 *
 * https://developer.comm100.com/docs/server-api-global-setting-agent, Agent
 * JSON Format: id, email ("Agent login email."), displayName ("If not display
 * name given, will be set by both first name and last name."), isAdmin
 * ("Whether the agent is an administrator or not."), isActive, isLocked,
 * isDeleted, departmentIds.
 */
import { z } from 'zod'
import type { User } from '../../../schema'
import { pickStr, required, strMap } from './shared'

export interface RawComm100Agent {
  id?: string
  email?: string
  displayName?: string
  isAdmin?: boolean
  isActive?: boolean
  isLocked?: boolean
  isDeleted?: boolean
  departmentIds?: string[] | null
  [key: string]: unknown
}

const Email = z.email()

function role(isAdmin: unknown): string | undefined {
  if (isAdmin === true) return 'admin'
  if (isAdmin === false) return 'agent'
  return undefined
}

export function transformUser(raw: RawComm100Agent): User {
  const id = required(pickStr(raw.id), 'agent id')
  const email = pickStr(raw.email)
  return {
    id,
    externalId: id,
    email: email !== undefined && Email.safeParse(email).success ? email : undefined,
    name: pickStr(raw.displayName) ?? '',
    role: role(raw.isAdmin),
    teamIds: Array.isArray(raw.departmentIds) ? raw.departmentIds.map(String) : [],
    platform: 'comm100',
    metadata: strMap({
      isActive: raw.isActive,
      isLocked: raw.isLocked,
      isDeleted: raw.isDeleted,
    }),
    raw,
  }
}
