import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Raw Paymo company object (the object under the `company` response key).
 *
 * Paymo is a single-tenant SaaS: one account = one company. There is no
 * workspace concept in the Paymo data model. We derive a single Workspace
 * record from the `/company` endpoint so that the canonical workspace
 * resource resolves for any account.
 *
 * Only the fields the canonical transform reads are typed; everything else
 * survives on `raw`.
 */
export interface RawPaymoCompany {
  id: number
  name?: string
  current_users?: number
  country?: string
  timezone?: string
  default_currency?: string
  created_on?: string
  updated_on?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawPaymoCompany): Workspace {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    memberCount: typeof raw.current_users === 'number' ? raw.current_users : undefined,
    platform: 'paymo',
    metadata: strMap({
      country: raw.country,
      timezone: raw.timezone,
      currency: raw.default_currency,
    }),
    raw,
  }
}
