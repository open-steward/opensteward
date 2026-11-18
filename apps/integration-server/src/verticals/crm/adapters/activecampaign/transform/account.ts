import { toIsoDatetime } from '@opensteward/shared'
import type { Company } from '../../../schema/company'

/**
 * A CRM account, "the organizations your contacts belong to", as returned by
 * GET /accounts (https://developers.activecampaign.com/reference/list-all-accounts)
 * and GET /accounts/:id (https://developers.activecampaign.com/reference/retrieve-an-account).
 * Only the fields the documented examples carry are read.
 */
export interface RawActiveCampaignAccount {
  id: string
  name: string
  accountUrl?: string | null
  createdTimestamp?: string
  updatedTimestamp?: string
  [key: string]: unknown
}

/** The host of the documented `accountUrl` (e.g. "https://www.example.com"). */
function hostOf(accountUrl: string | null | undefined): string | undefined {
  if (!accountUrl) return undefined
  try {
    return new URL(accountUrl).hostname || undefined
  } catch {
    return undefined
  }
}

export function transformAccount(raw: RawActiveCampaignAccount): Company {
  const domain = hostOf(raw.accountUrl)
  const createdAt = toIsoDatetime(raw.createdTimestamp)
  const updatedAt = toIsoDatetime(raw.updatedTimestamp)
  return {
    id: String(raw.id),
    name: raw.name,
    ...(domain !== undefined ? { domain } : {}),
    ...(createdAt !== undefined ? { created_at: createdAt } : {}),
    ...(updatedAt !== undefined ? { updated_at: updatedAt } : {}),
    metadata: raw,
  }
}
