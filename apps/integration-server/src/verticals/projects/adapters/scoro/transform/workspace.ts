/**
 * Transform a raw Scoro company account into the canonical Workspace schema.
 *
 * Scoro uses "companyAccount" as the top-level business entity.
 * The /companyAccount/list endpoint returns active entities with:
 *   entity_id    – integer identifier
 *   entity_name  – display name of the business entity
 *
 * For a simpler representation we also accept the full companyAccount
 * response fields (company_name, site_plan, etc.).
 */
import type { Workspace } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawScoroCompanyAccount {
  entity_id?: number | string
  entity_name?: string
  company_name?: string
  site_plan?: { name?: string }
  base_currency?: string
  [key: string]: unknown
}

export function transformWorkspace(raw: RawScoroCompanyAccount): Workspace {
  const id = String(raw.entity_id ?? '')
  const name =
    pickStr(raw.entity_name) ?? pickStr(raw.company_name) ?? ''

  return {
    id,
    externalId: id,
    name,
    platform: 'scoro',
    metadata: strMap({
      sitePlan: raw.site_plan?.name,
      baseCurrency: raw.base_currency,
    }),
    raw,
  }
}
