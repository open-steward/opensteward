/**
 * Transform a Smartsupp agent object into the canonical User schema.
 *
 * Shape: `components.schemas.agent` in the Smartsupp REST API v2 OpenAPI
 * (https://api.smartsupp.com/v2/specs/open-api.json), which marks all eight
 * fields required:
 *   id          — "The id of the agent." string, pattern ^[0-9]+$
 *   email       — "The email address of the agent. Not visible in widget."
 *   name        — "The name of the agent. Visible in widget when agent join the chat."
 *   avatar      — "Image of the agent."
 *   description — "The description of agent role or job position ..."
 *   role        — "Can be agent, admin or owner"
 *   status      — agent_status enum: "online" | "offline"
 *   active      — "The active flag. Not active agent can't send messages"
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawSmartsuppAgent {
  id: string
  email: string
  name: string
  avatar: string
  description: string
  role: string
  status: 'online' | 'offline'
  active: boolean
}

export function transformUser(raw: RawSmartsuppAgent): User {
  return {
    id: raw.id,
    externalId: raw.id,
    email: pickStr(raw.email),
    name: raw.name,
    role: pickStr(raw.role),
    teamIds: [],
    platform: 'smartsupp',
    metadata: strMap({
      status: raw.status,
      active: raw.active,
    }),
    raw,
  }
}
