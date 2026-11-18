/**
 * LiveHelpNow visitor (contact) → canonical Contact transform.
 *
 * Wire shape is from GET /api/analytics/chat/contact_list (date-scoped list).
 * The `VisitorID` field is used as the canonical ID.
 *
 * Transforms NEVER throw; missing optional fields return undefined.
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

/** Shape from GET /api/analytics/chat/contact_list */
export interface RawLivehelpnowContact {
  VisitorID?: string
  Detail1?: string  // typically visitor name
  Detail2?: string  // typically visitor email
  Detail3?: string | null
  Detail4?: string | null
  AgentEmail?: string | null
  ChatID?: number
  Department?: string | null
  Country?: string | null
  HostName?: string | null
  IPAddress?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawLivehelpnowContact): Contact {
  const id = pickStr(raw.VisitorID) ?? ''
  return {
    id,
    externalId: id,
    email: pickStr(raw.Detail2),
    name: pickStr(raw.Detail1) ?? '',
    platform: 'livehelpnow',
    metadata: strMap({
      department: raw.Department,
      country: raw.Country,
      hostname: raw.HostName,
      chatId: raw.ChatID,
    }),
    raw,
  }
}
