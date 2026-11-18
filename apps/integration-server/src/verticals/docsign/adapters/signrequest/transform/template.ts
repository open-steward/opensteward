import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIsoDatetime } from './shared'

/**
 * SignRequest Templates (`/templates/`) are lightweight: a uuid, a name, the
 * `who` policy, and a `url`. They do not expose explicit signer roles or a
 * document count, so those canonical fields are left empty/zero.
 */
export interface RawSignRequestTemplate {
  uuid: string
  name?: string | null
  who?: string
  url?: string
  team?: { subdomain?: string; name?: string } | null
  user?: { email?: string } | null
  created?: string
  [key: string]: unknown
}

export function transformTemplate(raw: RawSignRequestTemplate): Template {
  return {
    id: raw.uuid,
    externalId: raw.uuid,
    name: pickStr(raw.name) ?? '',
    signerRoles: [],
    documentCount: 0,
    createdAt: toIsoDatetime(raw.created),
    platform: 'signrequest',
    metadata: strMap({
      who: raw.who,
      url: raw.url,
      team: raw.team?.subdomain,
    }),
    raw,
  }
}
