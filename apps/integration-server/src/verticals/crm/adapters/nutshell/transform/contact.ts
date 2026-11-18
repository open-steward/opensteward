import type { Contact } from '../../../schema/contact'

export interface RawNutshellContact {
  id: number | string
  name?: string
  /** emails: { work: ["foo@bar.com"], home: [...] } or array */
  emails?: Record<string, string[]> | string[]
  /** phones: { work: ["555-1234"] } or array */
  phones?: Record<string, string[]> | string[]
  /** accounts the contact belongs to */
  accounts?: Array<{ id: number | string; entityType?: string; stub?: boolean; name?: string }>
  owner?: { id: number | string; entityType?: string } | null
  createdTime?: string
  modifiedTime?: string
  htmlUrl?: string
  [key: string]: unknown
}

function firstEmail(emails?: Record<string, string[]> | string[]): string | undefined {
  if (!emails) return undefined
  if (Array.isArray(emails)) return emails[0]
  for (const vals of Object.values(emails)) {
    if (vals.length > 0) return vals[0]
  }
  return undefined
}

function firstPhone(phones?: Record<string, string[]> | string[]): string | undefined {
  if (!phones) return undefined
  if (Array.isArray(phones)) return phones[0]
  for (const vals of Object.values(phones)) {
    if (vals.length > 0) return vals[0]
  }
  return undefined
}

export function transformContact(raw: RawNutshellContact): Contact {
  const nameParts = (raw.name ?? '').trim().split(/\s+/)
  const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : nameParts[0]
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : undefined

  return {
    id: String(raw.id),
    name: raw.name,
    first_name: firstName || undefined,
    last_name: lastName,
    email: firstEmail(raw.emails),
    phone: firstPhone(raw.phones),
    company_id: raw.accounts?.[0]?.id != null ? String(raw.accounts[0].id) : undefined,
    owner_id: raw.owner?.id != null ? String(raw.owner.id) : undefined,
    created_at: raw.createdTime,
    updated_at: raw.modifiedTime,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) {
    out.name = data.name
  } else if (data.first_name !== undefined || data.last_name !== undefined) {
    out.name = [data.first_name, data.last_name].filter(Boolean).join(' ')
  }
  if (data.email !== undefined) out.emails = { work: [data.email] }
  if (data.phone !== undefined) out.phones = { work: [data.phone] }
  if (data.company_id !== undefined) {
    out.accounts = [{ id: Number(data.company_id), entityType: 'Accounts' }]
  }
  if (data.owner_id !== undefined) {
    out.owner = { id: Number(data.owner_id), entityType: 'Users' }
  }
  return out
}
