import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'
import { pickStr, strMap } from './shared'

/**
 * A Gr4vy *buyer* maps to a canonical Customer. PII lives under
 * `billing_details`; the merchant-supplied id is `external_identifier`.
 *
 * Docs: https://docs.gr4vy.com/reference/buyers/get-buyer
 */
export interface RawGr4vyBuyer {
  id?: string
  external_identifier?: string | null
  display_name?: string | null
  billing_details?: {
    first_name?: string | null
    last_name?: string | null
    email_address?: string | null
    phone_number?: string | null
  } | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

export function transformCustomer(raw: RawGr4vyBuyer): Customer {
  const billing = raw.billing_details ?? undefined
  const composedName = [billing?.first_name, billing?.last_name]
    .filter((p): p is string => Boolean(p))
    .join(' ')
    .trim()
  return {
    id: String(raw.id ?? ''),
    externalId: pickStr(raw.external_identifier) ?? String(raw.id ?? ''),
    email: pickStr(billing?.email_address),
    name: pickStr(raw.display_name) ?? (composedName || undefined),
    phone: pickStr(billing?.phone_number),
    gateway: 'gr4vy',
    metadata: strMap({}),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}

/** Canonical Customer → Gr4vy buyer create/update body (snake_case wire). */
export function untransformCustomer(c: Partial<Customer>): Record<string, unknown> {
  const billing: Record<string, unknown> = {}
  if (c.email !== undefined) billing.email_address = c.email
  if (c.phone !== undefined) billing.phone_number = c.phone
  if (c.name != null) {
    const [first, ...rest] = c.name.trim().split(/\s+/)
    if (first) billing.first_name = first
    if (rest.length > 0) billing.last_name = rest.join(' ')
  }
  const out: Record<string, unknown> = {}
  if (c.name !== undefined) out.display_name = c.name
  if (c.externalId !== undefined) out.external_identifier = c.externalId
  if (Object.keys(billing).length > 0) out.billing_details = billing
  return out
}
