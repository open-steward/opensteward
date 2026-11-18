import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Procore directory user. Returned by
 * `GET /rest/v1.0/companies/{company_id}/users`. `email_address` is the
 * canonical email; `login` is the email used to authenticate and is used as a
 * fallback. Users belong to the company (our canonical Workspace).
 */
export interface RawProcoreUser {
  id: number | string
  name?: string
  first_name?: string
  last_name?: string
  email_address?: string
  login?: string
  is_active?: boolean
  is_employee?: boolean
  job_title?: string
  [key: string]: unknown
}

function fullName(raw: RawProcoreUser): string {
  const composed = [raw.first_name, raw.last_name].filter(Boolean).join(' ').trim()
  return pickStr(raw.name) ?? (composed.length > 0 ? composed : '')
}

export function transformUser(raw: RawProcoreUser, workspaceId?: string): User {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email_address ?? raw.login),
    name: fullName(raw),
    workspaceIds: workspaceId ? [workspaceId] : [],
    platform: 'procore',
    metadata: strMap({
      jobTitle: raw.job_title,
      isActive: raw.is_active,
      isEmployee: raw.is_employee,
    }),
    raw,
  }
}
