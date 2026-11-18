/**
 * Transform a Kore.ai SmartAssist agent record into the canonical User.
 *
 * API endpoint: GET /agentassist/api/v1/public/{streamId}/organizations/{orgId}/agents
 * Response envelope: { results: RawKoreAiAgent[], skip, limit, hasMore, … }
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawKoreAiAgent {
  id?: string
  userId?: string
  firstName?: string
  lastName?: string
  nickName?: string
  emailId?: string
  phoneNumber?: string
  role?: string
  roleId?: string
  orgId?: string
  accountId?: string
  onlineStatus?: string
  onlineStatusType?: string
  status?: string
  /** Array of group/queue objects */
  agentGroups?: Array<{ id?: string; name?: string }>
  queues?: Array<{ id?: string; name?: string }>
  canSupportChat?: boolean
  canSupportVoice?: boolean
  canSupportCase?: boolean
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformUser(raw: RawKoreAiAgent): User {
  const id = pickStr(raw.id ?? raw.userId) ?? ''
  const name =
    [raw.nickName, raw.firstName, raw.lastName].filter(Boolean).join(' ').trim() ||
    pickStr(raw.emailId) ||
    ''
  const queueIds = (raw.queues ?? []).map((q) => q.id).filter(Boolean) as string[]
  const groupIds = (raw.agentGroups ?? []).map((g) => g.id).filter(Boolean) as string[]
  const teamIds = [...new Set([...queueIds, ...groupIds])]

  return {
    id,
    externalId: id,
    email: pickStr(raw.emailId),
    name,
    role: pickStr(raw.role),
    teamIds,
    platform: 'kore-ai',
    metadata: strMap({
      onlineStatus: raw.onlineStatus,
      onlineStatusType: raw.onlineStatusType,
      status: raw.status,
      orgId: raw.orgId,
    }),
    raw,
  }
}
