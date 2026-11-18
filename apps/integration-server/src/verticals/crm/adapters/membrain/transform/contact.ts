import type { Contact } from '../../../schema/contact'
import { guid, required, text } from '../fields'

/**
 * A Contact as GET /contacts/ and GET /contacts/{Id} return it
 * (https://www.membrain.com/developers/api-documentation, "GET /contacts/"
 * Example Result). Only the fields mapped below are named; the rest stay in
 * `metadata`.
 */
export interface RawMembrainContact {
  Id: string
  Name?: string
  FirstName?: string
  LastName?: string
  EmailAddress?: string
  WorkPhone?: string
  CellularPhone?: string
  Position?: string
  CompanyId?: string
  [key: string]: unknown
}

export function transformContact(raw: RawMembrainContact): Contact {
  return {
    id: required(raw.Id, 'Id', 'contact'),
    first_name: text(raw.FirstName),
    last_name: text(raw.LastName),
    name: text(raw.Name),
    email: text(raw.EmailAddress),
    phone: text(raw.WorkPhone),
    mobile: text(raw.CellularPhone),
    title: text(raw.Position),
    company_id: guid(raw.CompanyId),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstName = data.first_name
  if (data.last_name !== undefined) out.lastName = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.mobile !== undefined) out.mobile = data.mobile
  if (data.company_id !== undefined) out.company = { id: data.company_id }
  return out
}
