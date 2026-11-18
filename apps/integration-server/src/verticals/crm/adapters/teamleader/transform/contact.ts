import type { Contact } from '../../../schema/contact'

export interface RawTeamleaderContact {
  id: string
  first_name?: string
  last_name?: string
  emails?: Array<{ email: string; type?: string }>
  telephones?: Array<{ number: string; type?: string }>
  primary_company?: { id: string; name?: string } | null
  [key: string]: unknown
}

export function transformContact(raw: RawTeamleaderContact): Contact {
  const primaryEmail = raw.emails?.[0]?.email
  const primaryPhone = raw.telephones?.[0]?.number

  return {
    id: raw.id,
    first_name: raw.first_name,
    last_name: raw.last_name,
    name: [raw.first_name, raw.last_name].filter(Boolean).join(' ') || undefined,
    email: primaryEmail,
    phone: primaryPhone,
    company_id: raw.primary_company?.id ?? undefined,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.first_name = data.first_name
  if (data.last_name !== undefined) out.last_name = data.last_name
  if (data.email !== undefined) out.emails = [{ email: data.email, type: 'primary' }]
  if (data.phone !== undefined) out.telephones = [{ number: data.phone, type: 'phone' }]
  if (data.company_id !== undefined) out.primary_company = { id: data.company_id, type: 'company' }
  return out
}
