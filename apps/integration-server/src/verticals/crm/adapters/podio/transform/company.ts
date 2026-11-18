import type { Company } from '../../../schema/company'
import type { PodioItem } from '../client'
import { getFieldValue, buildFields } from './helpers'
import { COMPANY_FIELDS } from '../constants'

export function transformCompany(raw: PodioItem): Company {
  const f = raw.fields
  const name = getFieldValue(f, COMPANY_FIELDS.NAME) ?? `Company ${raw.item_id}`
  return {
    id: String(raw.item_id),
    name,
    domain: getFieldValue(f, COMPANY_FIELDS.WEBSITE),
    phone: getFieldValue(f, COMPANY_FIELDS.PHONE),
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const pairs: Array<[string, Array<Record<string, unknown>>]> = []
  if (data.name !== undefined)
    pairs.push([COMPANY_FIELDS.NAME, [{ value: data.name }]])
  if (data.domain !== undefined)
    pairs.push([COMPANY_FIELDS.WEBSITE, [{ value: data.domain }]])
  if (data.phone !== undefined)
    pairs.push([COMPANY_FIELDS.PHONE, [{ value: data.phone }]])
  return { fields: buildFields(pairs) }
}
