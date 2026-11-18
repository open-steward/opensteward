/**
 * Transform a raw Take Blip attendant (application/vnd.iris.desk.attendant+json)
 * to the canonical User schema.
 *
 * Attendants are returned from GET /attendants via postmaster@desk.msging.net
 * (docs.blip.ai, "Get all bot's agents"). The documented item is:
 *
 *   { "identity": "rafaelpa%40take.net@blip.ai", "teams": ["Default"],
 *     "status": "Online", "lastServiceDate": "2018-07-05T19:39:07.640Z" }
 *
 * No name, email or role is documented on an attendant, so none is read. The
 * identity is the attendant's only documented identifier and stands in for
 * the required canonical name.
 *
 * Docs: https://docs.blip.ai/#get-all-bot-39-s-agents
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawTakeBlipAgent {
  identity?: string
  teams?: string[] | null
  status?: string
  lastServiceDate?: string
  [key: string]: unknown
}

export function transformUser(raw: RawTakeBlipAgent): User {
  const identity = pickStr(raw.identity)
  if (!identity) throw new Error('TakeBlip attendant has no identity')

  return {
    id: identity,
    externalId: identity,
    name: identity,
    // Teams are named, and a team's name is its id (see transform/team.ts).
    teamIds: Array.isArray(raw.teams) ? raw.teams.map(String) : [],
    platform: 'take-blip',
    metadata: strMap({ status: raw.status, lastServiceDate: raw.lastServiceDate }),
    raw,
  }
}
