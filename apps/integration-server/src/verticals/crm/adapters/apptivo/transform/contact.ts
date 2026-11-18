import type { Contact } from '../../../schema/contact'

// TODO: verify endpoint field names from Apptivo /customer object
export interface RawApptivoContact {
  customerId?: string
  id?: string
  firstName?: string
  lastName?: string
  emailAddressList?: Array<{ emailAddress?: string }>
  phoneList?: Array<{ phone?: string; type?: string }>
  companyId?: string | null
  assigneeId?: string | null
  createdDate?: string | null
  modifiedDate?: string | null
  [key: string]: unknown
}

function getEmail(raw: RawApptivoContact): string | undefined {
  return raw.emailAddressList?.[0]?.emailAddress
}

function getPhone(raw: RawApptivoContact, type: string): string | undefined {
  return raw.phoneList?.find((p) => p.type === type)?.phone
}

export function transformContact(raw: RawApptivoContact): Contact {
  const id = raw.customerId ?? raw.id ?? ''
  return {
    id: String(id),
    first_name: raw.firstName,
    last_name: raw.lastName,
    name: [raw.firstName, raw.lastName].filter(Boolean).join(' ') || undefined,
    email: getEmail(raw),
    phone: getPhone(raw, 'work') ?? getPhone(raw, 'office') ?? raw.phoneList?.[0]?.phone,
    mobile: getPhone(raw, 'mobile') ?? getPhone(raw, 'cell'),
    company_id: raw.companyId != null ? String(raw.companyId) : undefined,
    owner_id: raw.assigneeId != null ? String(raw.assigneeId) : undefined,
    created_at: raw.createdDate ?? undefined,
    updated_at: raw.modifiedDate ?? undefined,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstName = data.first_name
  if (data.last_name !== undefined) out.lastName = data.last_name
  if (data.email !== undefined) out.emailAddressList = [{ emailAddress: data.email }]
  if (data.phone !== undefined) out.phoneList = [{ phone: data.phone, type: 'work' }]
  if (data.company_id !== undefined) out.companyId = data.company_id
  if (data.owner_id !== undefined) out.assigneeId = data.owner_id
  return out
}
