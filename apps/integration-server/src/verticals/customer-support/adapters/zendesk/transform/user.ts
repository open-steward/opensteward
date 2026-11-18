import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawZendeskAgent {
  id: number
  name?: string
  email?: string
  role?: string
  default_group_id?: number | null
  [key: string]: unknown
}

export function transformUser(raw: RawZendeskAgent): User {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    role: pickStr(raw.role),
    teamIds: raw.default_group_id ? [String(raw.default_group_id)] : [],
    platform: 'zendesk',
    metadata: strMap({}),
    raw,
  }
}
