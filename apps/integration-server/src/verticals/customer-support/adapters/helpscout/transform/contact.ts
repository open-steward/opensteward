/**
 * Help Scout customer → canonical Contact.
 *
 * Fields from the Get Customer / List Customers response docs:
 * https://developer.helpscout.com/mailbox-api/endpoints/customers/get/
 * https://developer.helpscout.com/mailbox-api/endpoints/customers/list/
 */
import { z } from 'zod'
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

interface RawValue {
  id?: number
  value?: string
  type?: string
}

export interface RawHelpScoutCustomer {
  id: number
  firstName?: string
  lastName?: string
  organizationId?: number | null
  createdAt?: string
  updatedAt?: string
  draft?: boolean
  _embedded?: {
    emails?: RawValue[]
    phones?: RawValue[]
    [key: string]: unknown
  }
  [key: string]: unknown
}

const Email = z.email()

/** The first embedded email that is an address; the schema refuses anything else. */
function firstEmail(raw: RawHelpScoutCustomer): string | undefined {
  for (const e of raw._embedded?.emails ?? []) {
    const v = typeof e?.value === 'string' ? e.value.trim() : ''
    if (v && Email.safeParse(v).success) return v
  }
  return undefined
}

function firstPhone(raw: RawHelpScoutCustomer): string | undefined {
  for (const p of raw._embedded?.phones ?? []) {
    const v = pickStr(p?.value)
    if (v) return v
  }
  return undefined
}

export function fullName(first: unknown, last: unknown): string {
  return [pickStr(first), pickStr(last)].filter(Boolean).join(' ')
}

export function transformContact(raw: RawHelpScoutCustomer): Contact {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: firstEmail(raw),
    name: fullName(raw.firstName, raw.lastName),
    phone: firstPhone(raw),
    organizationId: raw.organizationId != null ? String(raw.organizationId) : undefined,
    platform: 'helpscout',
    metadata: strMap({
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      draft: raw.draft,
    }),
    raw,
  }
}
