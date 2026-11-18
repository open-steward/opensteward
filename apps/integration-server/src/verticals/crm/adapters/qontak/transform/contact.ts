import type { Contact } from '../../../schema/contact'
import { iso, ref, requireId, text } from '../fields'

/**
 * A contact as GET /qontak/crm/contacts and GET /qontak/crm/contacts/{id}
 * return it. Only the fields this transform reads are typed; every key is
 * from the documented 200 example in Qontak's CRM OpenAPI
 * (https://raw.githubusercontent.com/qontak-dev/docs/master/Qontak-CRM-OpenAPI-MAG.json).
 */
export interface RawQontakContact {
  id: number | string
  first_name?: string | null
  last_name?: string | null
  job_title?: string | null
  email?: string | null
  telephone?: string | null
  crm_status_name?: string | null
  crm_company_id?: number | string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawQontakContact): Contact {
  return {
    id: requireId(raw.id, 'contact'),
    first_name: text(raw.first_name),
    last_name: text(raw.last_name),
    title: text(raw.job_title),
    email: text(raw.email),
    phone: text(raw.telephone),
    stage: text(raw.crm_status_name),
    company_id: ref(raw.crm_company_id),
    created_at: iso(raw.created_at),
    updated_at: iso(raw.updated_at),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.first_name = data.first_name
  if (data.last_name !== undefined) out.last_name = data.last_name
  if (data.name !== undefined) out.name = data.name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.mobile !== undefined) out.mobile_number = data.mobile
  if (data.company_id !== undefined) out.organization_id = data.company_id
  if (data.owner_id !== undefined) out.owner_id = data.owner_id
  return out
}
