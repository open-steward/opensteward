import type { Contact } from '../../../schema/contact'

export interface RawAffinityContact {
  id: number
  first_name?: string
  last_name?: string
  primary_email_address?: string
  email_addresses?: Array<{ address: string; type?: string }>
  phone_numbers?: Array<{ number: string; type?: string }>
  organization_ids?: number[]
  [key: string]: unknown
}

export function transformContact(raw: RawAffinityContact): Contact {
  return {
    id: String(raw.id),
    first_name: raw.first_name,
    last_name: raw.last_name,
    name: [raw.first_name, raw.last_name].filter(Boolean).join(' ') || undefined,
    email: raw.primary_email_address ?? raw.email_addresses?.[0]?.address,
    phone: raw.phone_numbers?.[0]?.number,
    company_id: raw.organization_ids?.[0] != null
      ? String(raw.organization_ids[0])
      : undefined,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.first_name = data.first_name
  if (data.last_name !== undefined) out.last_name = data.last_name
  if (data.email !== undefined) {
    out.email_addresses = [{ address: data.email, type: 'primary' }]
  }
  if (data.phone !== undefined) {
    out.phone_numbers = [{ number: data.phone }]
  }
  if (data.company_id !== undefined) {
    out.organization_ids = [Number(data.company_id)]
  }
  return out
}
