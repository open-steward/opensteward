import type { Company } from '../../../schema/company'
import type { NetHuntRecord } from '../types'

/**
 * A record of the folder whose `role` is `company` → canonical Company.
 *
 * Company.name is required and its only documented source is the record's
 * `name` key ("The `name` key sets the record display name"). The API omits
 * empty fields ("Empty and unset fields are omitted"), so a record with no
 * name is refused rather than given an invented one. Custom fields stay in
 * `metadata.fields`: the API documents no role binding for them.
 */
export function transformCompany(raw: NetHuntRecord): Company {
  const name = raw.fields['name']
  if (typeof name !== 'string' || name === '') {
    throw new Error(`NetHunt CRM company record ${raw.id} has no name`)
  }
  return {
    id: raw.id,
    name,
    created_at: raw.createdISO,
    updated_at: raw.updatedISO,
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out['name'] = data.name
  if (data.domain !== undefined) out['domain'] = data.domain
  if (data.phone !== undefined) out['phone'] = data.phone
  if (data.industry !== undefined) out['industry'] = data.industry
  return out
}
