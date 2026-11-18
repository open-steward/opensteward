/**
 * Transform a Kore.ai SmartAssist queue record into the canonical Team.
 *
 * API endpoint: GET /agentassist/api/v1/public/{streamId}/queues
 * Docs: https://koreai.mintlify.site/ai-for-service/apis/contact-center/get-a-list-of-queues
 * Response envelope: { results: RawKoreAiQueue[], page, limit, hasMore, totalPages, totalResults }
 *
 * Kore.ai queues are the closest concept to a "team" — they route conversations
 * to groups of agents and carry their own SLA / routing rules.
 */
import type { Team } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawKoreAiQueue {
  id?: string
  name?: string
  description?: string
  isActive?: boolean
  isDefault?: boolean
  orgId?: string
  createdBy?: string
  isAdvancedRoutingEnabled?: boolean
  hoursOfOperation?: { id?: string; name?: string }
  agents?: Array<{ userId?: string; name?: string }>
  agentGroups?: Array<{ id?: string; name?: string }>
  [key: string]: unknown
}

export function transformTeam(raw: RawKoreAiQueue): Team {
  // `id` and `name` are in every documented queue sample; a queue without
  // them has nothing to key or label it by, so refuse rather than invent one.
  const id = pickStr(raw.id)
  if (id === undefined) throw new Error('kore-ai: queue has no `id`')
  const name = pickStr(raw.name)
  if (name === undefined) throw new Error(`kore-ai: queue ${id} has no \`name\``)
  return {
    id,
    externalId: id,
    name,
    platform: 'kore-ai',
    metadata: strMap({
      description: raw.description,
      isActive: raw.isActive,
      isDefault: raw.isDefault,
      orgId: raw.orgId,
      hoursOfOperation: raw.hoursOfOperation?.name,
    }),
    raw,
  }
}
