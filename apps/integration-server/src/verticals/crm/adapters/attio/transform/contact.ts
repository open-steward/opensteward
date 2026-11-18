import type { Contact } from '../../../schema/contact'

// ── Raw Attio types ────────────────────────────────────────────────────────

interface AttioTextValue {
  value: string
  attribute_type: string
}

interface AttioEmailValue {
  original_email_address: string
  email_address?: string
  attribute_type?: string
}

interface AttioPhoneValue {
  phone_number: string
  attribute_type?: string
}

interface AttioNameValue {
  full_name?: string
  first_name?: string
  last_name?: string
  attribute_type?: string
}

interface AttioRecordRef {
  target_record_id: string
  attribute_type?: string
}

interface AttioActorRef {
  id: {
    workspace_member_id: string
  }
}

interface AttioRecordId {
  record_id: string
  created_at?: string
}

export interface RawAttioContact {
  id: AttioRecordId
  values: {
    name?: AttioNameValue[]
    first_name?: AttioTextValue[]
    last_name?: AttioTextValue[]
    email_addresses?: AttioEmailValue[]
    phone_numbers?: AttioPhoneValue[]
    job_title?: AttioTextValue[]
    primary_company?: AttioRecordRef[]
    owner?: AttioActorRef[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

// ── Helpers ────────────────────────────────────────────────────────────────

function splitFullName(full: string): { first: string; last: string } {
  const idx = full.lastIndexOf(' ')
  if (idx === -1) return { first: full, last: '' }
  return { first: full.substring(0, idx), last: full.substring(idx + 1) }
}

// ── Transform ──────────────────────────────────────────────────────────────

export function transformContact(raw: RawAttioContact): Contact {
  const v = raw.values

  // Prefer explicit first/last; fall back to splitting full_name
  let first_name: string | undefined = v.first_name?.[0]?.value
  let last_name: string | undefined = v.last_name?.[0]?.value
  let name: string | undefined

  if (!first_name && !last_name) {
    const full = v.name?.[0]?.full_name
    if (full) {
      const split = splitFullName(full)
      first_name = split.first || undefined
      last_name = split.last || undefined
      name = full
    }
  } else {
    name = [first_name, last_name].filter(Boolean).join(' ') || undefined
  }

  return {
    id: String(raw.id.record_id),
    first_name: first_name || undefined,
    last_name: last_name || undefined,
    name,
    email: v.email_addresses?.[0]?.original_email_address,
    phone: v.phone_numbers?.[0]?.phone_number,
    title: v.job_title?.[0]?.value,
    company_id: v.primary_company?.[0]?.target_record_id
      ? String(v.primary_company[0].target_record_id)
      : undefined,
    owner_id: v.owner?.[0]?.id.workspace_member_id
      ? String(v.owner[0].id.workspace_member_id)
      : undefined,
    created_at: raw.id.created_at,
    metadata: raw,
  }
}

// ── Untransform ────────────────────────────────────────────────────────────

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const values: Record<string, unknown> = {}

  const joined = [data.first_name, data.last_name].filter(Boolean).join(' ')
  const fullName = (data.name ?? joined) || undefined

  if (fullName) {
    values['name'] = [{ value: fullName }]
  }
  if (data.email !== undefined) {
    values['email_addresses'] = [{ original_email_address: data.email }]
  }
  if (data.phone !== undefined) {
    values['phone_numbers'] = [{ phone_number: data.phone }]
  }
  if (data.title !== undefined) {
    values['job_title'] = [{ value: data.title }]
  }

  return { data: { values } }
}
