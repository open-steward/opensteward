/**
 * Transform a Yellow.ai agent → canonical User.
 *
 * Source: "Agent chat concurrency", GET /api/agents/public/v1/agents/concurrency
 * (https://docs.yellow.ai/api/agent-chat-concurrency). Each `agents[]` item is
 * documented as: agentId string; currentChatConcurrency integer;
 * maxChatConcurrency integer (nullable); status string, "Possible values:
 * [available, dnd, away, offline]"; groups string[] "Group codes the agent
 * belongs to."; agentProfile { email, name, description, aliasname,
 * languages, signature }.
 */
import type { User } from '../../../schema'
import { strMap } from './shared'

export interface RawYellowAiAgent {
  agentId?: string
  currentChatConcurrency?: number
  maxChatConcurrency?: number | null
  status?: string
  groups?: string[]
  agentProfile?: {
    email?: string
    name?: string
    description?: string
    aliasname?: string
    languages?: string[]
    signature?: string
  }
}

export function transformUser(raw: RawYellowAiAgent): User {
  const id = raw.agentId
  if (typeof id !== 'string' || id === '') {
    throw new Error('yellow-ai agent has no agentId')
  }
  const email = raw.agentProfile?.email
  return {
    id,
    externalId: id,
    ...(email ? { email } : {}),
    name: raw.agentProfile?.name ?? '',
    teamIds: Array.isArray(raw.groups) ? raw.groups.map(String) : [],
    platform: 'yellow-ai',
    metadata: strMap({
      status: raw.status,
      currentChatConcurrency: raw.currentChatConcurrency,
      maxChatConcurrency: raw.maxChatConcurrency,
    }),
    raw,
  }
}
