import type { Contact } from '../../../schema/contact'

export interface RawOnePageCrmContact {
  id?: string | number
  first_name?: string
  last_name?: string
  email?: string
  job_title?: string
  company_id?: string | number
  phone_numbers?: Array<{ type?: string; value?: string }>
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformContact(raw: RawOnePageCrmContact): Contact {
  const phone = raw.phone_numbers?.find((p) => p.type === 'work' || p.type === 'mobile' || p.type === 'home')
  return {
    id: String(raw.id ?? ''),
    first_name: raw.first_name ?? undefined,
    last_name: raw.last_name ?? undefined,
    email: typeof raw.email === 'string' ? raw.email : undefined,
    title: raw.job_title ?? undefined,
    phone: phone?.value ?? undefined,
    company_id: raw.company_id != null ? String(raw.company_id) : undefined,
    created_at: raw.created_at ?? undefined,
    updated_at: raw.updated_at ?? undefined,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out['first_name'] = data.first_name
  if (data.last_name !== undefined) out['last_name'] = data.last_name
  if (data.email !== undefined) out['email'] = data.email
  if (data.title !== undefined) out['job_title'] = data.title
  if (data.company_id !== undefined) out['company_id'] = data.company_id
  if (data.phone !== undefined) {
    out['phone_numbers'] = [{ type: 'work', value: data.phone }]
  }
  return out
}
