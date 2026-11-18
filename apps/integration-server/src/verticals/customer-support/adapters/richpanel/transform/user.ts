import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawRichpanelAgent {
  id: string | number
  name?: string
  email?: string | null
  role?: string | null
  team_id?: string | number | null
  [key: string]: unknown
}

export function transformUser(raw: RawRichpanelAgent): User {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    role: pickStr(raw.role),
    teamIds: raw.team_id ? [String(raw.team_id)] : [],
    platform: 'richpanel',
    metadata: strMap({}),
    raw,
  }
}
