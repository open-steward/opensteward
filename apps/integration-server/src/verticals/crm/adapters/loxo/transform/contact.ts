import { toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'

/**
 * Raw Loxo person (people endpoint).
 * Primary email/phone are nested arrays; the first active entry is used.
 */
export interface RawLoxoPerson {
  id: number | string
  name?: string
  first_name?: string
  last_name?: string
  current_title?: string
  current_company?: string
  location?: string
  description?: string
  /** Array of email objects. */
  emails?: Array<{ address?: string; is_primary?: boolean; [k: string]: unknown }>
  /** Array of phone objects. */
  phones?: Array<{ number?: string; is_primary?: boolean; [k: string]: unknown }>
  owned_by_id?: number | string | null
  person_global_status_id?: number | string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function pickEmail(emails?: RawLoxoPerson['emails']): string | undefined {
  if (!emails || emails.length === 0) return undefined
  const primary = emails.find((e) => e.is_primary)
  return (primary ?? emails[0])?.address ?? undefined
}

function pickPhone(phones?: RawLoxoPerson['phones']): string | undefined {
  if (!phones || phones.length === 0) return undefined
  const primary = phones.find((p) => p.is_primary)
  return (primary ?? phones[0])?.number ?? undefined
}

export function transformContact(raw: RawLoxoPerson): Contact {
  return {
    id: String(raw.id),
    first_name: raw.first_name ?? undefined,
    last_name: raw.last_name ?? undefined,
    name: raw.name ?? undefined,
    email: pickEmail(raw.emails),
    phone: pickPhone(raw.phones),
    title: raw.current_title ?? undefined,
    owner_id: raw.owned_by_id != null ? String(raw.owned_by_id) : undefined,
    created_at: toIsoDatetime(raw.created_at),
    updated_at: toIsoDatetime(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.first_name !== undefined) out.first_name = data.first_name
  if (data.last_name !== undefined) out.last_name = data.last_name
  if (data.title !== undefined) out.current_title = data.title
  // Loxo API uses nested arrays for emails and phones, not flat strings.
  if (data.email !== undefined) {
    out.emails = [{ address: data.email, is_primary: true }]
  }
  if (data.phone !== undefined) {
    out.phones = [{ number: data.phone, is_primary: true }]
  }
  return out
}
