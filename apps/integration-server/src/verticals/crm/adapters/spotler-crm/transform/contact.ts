import type { Contact } from '../../../schema/contact'

/**
 * A contact `record`. https://support.reallysimplesystems.com/api-v4/ gives
 * no contact field list (fields come from `GET /datadictionary/contacts` on a
 * live account); it documents only that every record type is read by id
 * ("GET /{object_name}/12345 Above will return the record which has the ID of
 * 12345"). So only `id` is mapped and the rest of the record is `metadata`.
 */
export interface RawSpotlerContact {
  id: number
  [key: string]: unknown
}

export function transformContact(raw: RawSpotlerContact): Contact {
  return {
    id: String(raw.id),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstname = data.first_name
  if (data.last_name !== undefined) out.surname = data.last_name
  if (data.email !== undefined) out.emailaddress = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.company_id !== undefined) out.accountid = Number(data.company_id)
  return out
}
