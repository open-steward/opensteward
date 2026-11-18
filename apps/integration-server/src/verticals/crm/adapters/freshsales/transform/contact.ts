import type { Contact } from '../../../schema/contact'

export interface RawFreshsalesContact {
  id: number
  first_name?: string
  last_name?: string
  emails?: Array<{ value: string; is_primary?: boolean }>
  work_number?: string
  mobile_number?: string
  job_title?: string
  sales_account_id?: number | null
  owner_id?: number | null
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function primaryEmail(emails: Array<{ value: string; is_primary?: boolean }> | undefined): string | undefined {
  if (!emails || emails.length === 0) return undefined
  const primary = emails.find((e) => e.is_primary)
  return (primary ?? emails[0])?.value
}

export function transformContact(raw: RawFreshsalesContact): Contact {
  return {
    id: String(raw.id),
    first_name: raw.first_name,
    last_name: raw.last_name,
    name: [raw.first_name, raw.last_name].filter(Boolean).join(' ') || undefined,
    email: primaryEmail(raw.emails),
    phone: raw.work_number,
    mobile: raw.mobile_number,
    title: raw.job_title,
    company_id: raw.sales_account_id != null ? String(raw.sales_account_id) : undefined,
    owner_id: raw.owner_id != null ? String(raw.owner_id) : undefined,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.first_name = data.first_name
  if (data.last_name !== undefined) out.last_name = data.last_name
  if (data.email !== undefined) out.emails = [{ value: data.email, is_primary: true }]
  if (data.phone !== undefined) out.work_number = data.phone
  if (data.mobile !== undefined) out.mobile_number = data.mobile
  if (data.title !== undefined) out.job_title = data.title
  if (data.company_id !== undefined) out.sales_account_id = Number(data.company_id)
  if (data.owner_id !== undefined) out.owner_id = Number(data.owner_id)
  return out
}
