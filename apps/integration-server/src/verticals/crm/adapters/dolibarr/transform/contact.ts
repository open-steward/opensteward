import type { Contact } from '../../../schema/contact'

// Dolibarr contacts endpoint: GET /contacts
export interface RawDolibarrContact {
  id?: string | number
  firstname?: string
  lastname?: string
  email?: string
  phone_pro?: string
  phone_mobile?: string
  poste?: string  // job title
  socid?: string | number  // company/third party id
  date_creation?: string | number
  date_modification?: string | number
  [key: string]: unknown
}

export function transformContact(raw: RawDolibarrContact): Contact {
  return {
    id: String(raw.id ?? ''),
    first_name: raw.firstname ?? undefined,
    last_name: raw.lastname ?? undefined,
    email: raw.email ?? undefined,
    phone: raw.phone_pro ?? raw.phone_mobile ?? undefined,
    mobile: raw.phone_mobile ?? undefined,
    title: raw.poste ?? undefined,
    company_id: raw.socid != null ? String(raw.socid) : undefined,
    created_at: raw.date_creation
      ? new Date(Number(raw.date_creation) * 1000).toISOString()
      : undefined,
    updated_at: raw.date_modification
      ? new Date(Number(raw.date_modification) * 1000).toISOString()
      : undefined,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out['firstname'] = data.first_name
  if (data.last_name !== undefined) out['lastname'] = data.last_name
  if (data.email !== undefined) out['email'] = data.email
  if (data.phone !== undefined) out['phone_pro'] = data.phone
  if (data.title !== undefined) out['poste'] = data.title
  if (data.company_id !== undefined) out['socid'] = data.company_id
  return out
}
