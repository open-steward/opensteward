import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

/**
 * Procore Company — the top-level tenant in Procore, mapped onto the canonical
 * Workspace. Returned by `GET /rest/v1.0/companies`. Projects, RFIs and users
 * are all scoped beneath a company.
 */
export interface RawProcoreCompany {
  id: number | string
  name?: string
  is_active?: boolean
  logo_url?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawProcoreCompany): Workspace {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: pickStr(raw.name) ?? '',
    platform: 'procore',
    metadata: strMap({
      isActive: raw.is_active,
    }),
    raw,
  }
}
