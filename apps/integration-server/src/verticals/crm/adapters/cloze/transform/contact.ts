/**
 * Transform Cloze person records to/from the canonical Contact schema.
 *
 * Cloze person fields (from /v1/people/find and /v1/people/get):
 *   direct  — opaque string identifier (the canonical `id`)
 *   name    — full display name
 *   first   — given name
 *   last    — family name
 *   emails  — [{ value, work?, label? }]
 *   phones  — [{ value, mobile?, work?, label? }]
 *   stage   — lifecycle stage (lead, current, future, pending, won, lost)
 *   segment — user-defined segment
 *   created — ms epoch timestamp when the person was created
 *   modified — ms epoch timestamp of last change
 */

import { toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'

export interface ClozeEmailEntry {
  value?: string
  work?: boolean
  label?: string
}

export interface ClozePhoneEntry {
  value?: string
  mobile?: boolean
  work?: boolean
  label?: string
}

export interface RawClozePerson {
  /** Opaque unique identifier returned by Cloze (the `direct` field). */
  direct?: string
  /** Alternate id key used in some responses. */
  id?: string
  name?: string
  first?: string
  last?: string
  emails?: ClozeEmailEntry[]
  phones?: ClozePhoneEntry[]
  stage?: string
  segment?: string
  /** UTC ms epoch. */
  created?: number | string
  /** UTC ms epoch. */
  modified?: number | string
  [key: string]: unknown
}

function pickEmail(emails: ClozeEmailEntry[] | undefined): string | undefined {
  if (!emails || emails.length === 0) return undefined
  // Prefer a work email, fall back to first
  const work = emails.find((e) => e.work)
  return (work ?? emails[0])?.value
}

function pickPhone(phones: ClozePhoneEntry[] | undefined): string | undefined {
  if (!phones || phones.length === 0) return undefined
  return phones[0]?.value
}

export function transformContact(raw: RawClozePerson): Contact {
  const id = raw.direct ?? raw.id ?? ''
  const nameParts = [raw.first, raw.last].filter(Boolean)
  return {
    id: String(id),
    first_name: raw.first,
    last_name: raw.last,
    name: raw.name ?? (nameParts.length > 0 ? nameParts.join(' ') : undefined),
    email: pickEmail(raw.emails),
    phone: pickPhone(raw.phones),
    stage: raw.stage,
    created_at: toIsoDatetime(raw.created),
    updated_at: toIsoDatetime(raw.modified),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.first_name !== undefined) out.first = data.first_name
  if (data.last_name !== undefined) out.last = data.last_name
  if (data.email !== undefined) out.emails = [{ value: data.email, work: true }]
  if (data.phone !== undefined) out.phones = [{ value: data.phone }]
  if (data.stage !== undefined) out.stage = data.stage
  return out
}
