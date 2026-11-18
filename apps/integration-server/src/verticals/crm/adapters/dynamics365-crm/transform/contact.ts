import type { Contact } from '../../../schema/contact'

export interface RawDynamicsContact {
  contactid: string
  firstname?: string | null
  lastname?: string | null
  emailaddress1?: string | null
  telephone1?: string | null
  jobtitle?: string | null
  _parentcustomerid_value?: string | null
  _ownerid_value?: string | null
  createdon?: string | null
  modifiedon?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawDynamicsContact): Contact {
  return {
    id: String(raw.contactid),
    first_name: raw.firstname ?? undefined,
    last_name: raw.lastname ?? undefined,
    name: [raw.firstname, raw.lastname].filter(Boolean).join(' ') || undefined,
    email: raw.emailaddress1 ?? undefined,
    phone: raw.telephone1 ?? undefined,
    title: raw.jobtitle ?? undefined,
    company_id: raw._parentcustomerid_value ?? undefined,
    owner_id: raw._ownerid_value ?? undefined,
    created_at: raw.createdon ?? undefined,
    updated_at: raw.modifiedon ?? undefined,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstname = data.first_name
  if (data.last_name !== undefined) out.lastname = data.last_name
  if (data.email !== undefined) out.emailaddress1 = data.email
  if (data.phone !== undefined) out.telephone1 = data.phone
  if (data.title !== undefined) out.jobtitle = data.title
  return out
}
