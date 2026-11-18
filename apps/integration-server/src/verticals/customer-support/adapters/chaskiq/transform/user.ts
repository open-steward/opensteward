/**
 * Chaskiq agent → canonical User.
 *
 * AgentType fields: id, email, name, first_name, last_name, display_name,
 * available, lang, area_of_expertise, availability.
 */
import type { User } from '../../../schema'
import { pickStr, strMap } from './shared'

/** Raw AgentType from Chaskiq GraphQL. */
export interface RawChaskiqAgent {
  id?: string | null
  email?: string | null
  name?: string | null
  first_name?: string | null
  last_name?: string | null
  display_name?: string | null
  available?: boolean | null
  lang?: string | null
  area_of_expertise?: string | null
  availability?: string | null
  [key: string]: unknown
}

function resolveName(raw: RawChaskiqAgent): string {
  const computed = [raw.first_name, raw.last_name].filter(Boolean).join(' ')
  return (
    pickStr(raw.display_name) ??
    pickStr(raw.name) ??
    pickStr(computed) ??
    ''
  )
}

export function transformUser(raw: RawChaskiqAgent): User {
  const id = pickStr(raw.id) ?? ''
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: resolveName(raw),
    role: pickStr(raw.area_of_expertise) ?? pickStr(raw.availability),
    teamIds: [],
    platform: 'chaskiq',
    metadata: strMap({
      available: raw.available,
      lang: raw.lang,
    }),
    raw,
  }
}
