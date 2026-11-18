/**
 * Transform SysAid service-record activity → canonical Message.
 *
 * SysAid activities (Connect API v1: GET /activities/sr/search):
 *   id, srId, description, actionType (note/activity),
 *   isNote (boolean), userName, agentId, endUserId,
 *   startTime, endTime, totalTime
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

export interface RawSysaidActivity {
  id?: number | string
  srId?: number | string
  description?: string
  notes?: string
  actionType?: string
  isNote?: boolean
  userName?: string
  agentId?: number | string
  endUserId?: number | string
  startTime?: string
  endTime?: string
  [key: string]: unknown
}

export function transformMessage(raw: RawSysaidActivity, ticketId: string): Message {
  // Activities with agentId are internal; end-user activities are public
  const type: MessageType = raw.agentId ? 'internal' : 'public'
  const authorType: AuthorType = raw.agentId ? 'user' : (raw.endUserId ? 'contact' : 'system')
  const authorId = raw.agentId
    ? String(raw.agentId)
    : raw.endUserId
      ? String(raw.endUserId)
      : pickStr(raw.userName) ?? ''

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    ticketId,
    authorId,
    authorType,
    body: pickStr(raw.description) ?? pickStr(raw.notes) ?? '',
    type,
    createdAt: toIso(raw.startTime) ?? new Date(0).toISOString(),
    platform: 'sysaid',
    metadata: strMap({
      actionType: raw.actionType,
      userName: raw.userName,
    }),
    raw,
  }
}
