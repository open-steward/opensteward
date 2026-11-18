import type { Company } from '../../../schema/company'
import { present, recordId, type RawTwentyRecord } from '../records'

/**
 * Twenty "companies" (CompanyWorkspaceEntity, twentyhq/twenty
 * packages/twenty-server/src/modules/company/standard-objects/company.workspace-entity.ts):
 *   name: string | null
 *   domainName: LinksMetadata         ({ primaryLinkLabel, primaryLinkUrl, secondaryLinks })
 *   accountOwnerId: string | null     (MANY_TO_ONE join column to a workspace member)
 */
export interface RawTwentyCompany extends RawTwentyRecord {
  name?: string | null
  domainName?: {
    primaryLinkLabel?: string | null
    primaryLinkUrl?: string | null
    secondaryLinks?: unknown[] | null
  } | null
  accountOwnerId?: string | null
}

export function transformCompany(raw: RawTwentyCompany): Company {
  return {
    id: recordId(raw, 'company'),
    // `name` is nullable in Twenty and required here; a company saved without
    // one has an empty name, which is what Twenty holds for it.
    name: raw.name ?? '',
    domain: present(raw.domainName?.primaryLinkUrl),
    owner_id: present(raw.accountOwnerId),
    created_at: raw.createdAt,
    updated_at: raw.updatedAt,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phones = { primaryPhoneNumber: data.phone }
  if (data.domain !== undefined) out.domainName = { primaryLinkUrl: data.domain }
  if (data.industry !== undefined) out.industryType = data.industry
  return out
}
