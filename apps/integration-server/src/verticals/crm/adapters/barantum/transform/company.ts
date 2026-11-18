import type { Company } from '../../../schema/company'
import type { Address } from '../../../schema/shared'
import { requireUuid, text } from './fields'

/**
 * A row of the Org module (Barantum's companies), as `POST
 * /api/get_list_data` with `"module": "Org"` returns it in `result.content[]`.
 *
 * Docs: https://docs.barantum.com/api/collections/23513668/2sBYAuTBr5
 * ("[Org] Get Data", Expected Response). Only the fields this transform reads
 * are typed; the rest stay in `metadata`.
 *
 * Not mapped, on purpose: `org_website` is a website, not the bare domain the
 * canonical `domain` holds; `org_owner` is a name, not a user id; `org_address_country` is documented
 * only as null, so its format is unknown, and the canonical country is an ISO
 * 3166-1 alpha-2 code; and
 * `date_created` / `date_modified` carry no zone and the docs name none.
 */
export interface RawBarantumCompany {
  org_uuid: string
  org_name?: string | null
  org_industry?: string | null
  org_phone_work?: string | null
  org_address_street?: string | null
  org_address_city?: string | null
  org_address_state?: string | null
  org_address_postalcode?: string | null
  [key: string]: unknown
}

export function transformCompany(raw: RawBarantumCompany): Company {
  const id = requireUuid(raw, 'org_uuid', 'Org')
  const name = text(raw.org_name)
  if (name === undefined) throw new Error(`Barantum Org ${id} has no org_name`)
  const address: Address = {
    line1: text(raw.org_address_street),
    city: text(raw.org_address_city),
    region: text(raw.org_address_state),
    postalCode: text(raw.org_address_postalcode),
  }
  const hasAddress = Object.values(address).some((v) => v !== undefined)
  return {
    id,
    name,
    phone: text(raw.org_phone_work),
    industry: text(raw.org_industry),
    address: hasAddress ? address : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.domain !== undefined) out.domain = data.domain
  if (data.phone !== undefined) out.phone = data.phone
  if (data.industry !== undefined) out.industry = data.industry
  if (data.size !== undefined) out.employee_count = data.size
  return out
}
