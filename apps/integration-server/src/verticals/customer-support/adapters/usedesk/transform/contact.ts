/**
 * UseDesk client (contact) transform.
 *
 * Clients are retrieved via POST /uapi/clients.
 * The response contains client objects with id (client_id), name, emails array,
 * phones array, company, and custom fields.
 *
 * Docs: https://api.usedocs.com/article/51385
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawUsedeskClient {
  /** Numeric client ID */
  id?: number | string
  /** Alias returned in some endpoints */
  client_id?: number | string
  name?: string
  /** Emails array: [{address: string, ...}] or flat string array */
  emails?: Array<{ address?: string } | string> | string | null
  /** Phones array: [{phone: string, ...}] or flat string array */
  phones?: Array<{ phone?: string } | string> | string | null
  company?: string | null
  note?: string | null
  [key: string]: unknown
}

function firstEmail(emails: RawUsedeskClient['emails']): string | undefined {
  if (!emails) return undefined
  if (typeof emails === 'string') return emails || undefined
  if (!Array.isArray(emails) || emails.length === 0) return undefined
  const first = emails[0]
  if (typeof first === 'string') return first || undefined
  return pickStr(first?.address)
}

function firstPhone(phones: RawUsedeskClient['phones']): string | undefined {
  if (!phones) return undefined
  if (typeof phones === 'string') return phones || undefined
  if (!Array.isArray(phones) || phones.length === 0) return undefined
  const first = phones[0]
  if (typeof first === 'string') return first || undefined
  return pickStr(first?.phone)
}

export function transformContact(raw: RawUsedeskClient): Contact {
  const id = String(raw.id ?? raw.client_id ?? '')
  return {
    id,
    externalId: id,
    email: firstEmail(raw.emails),
    name: pickStr(raw.name) ?? '',
    phone: firstPhone(raw.phones),
    organizationId: undefined,
    platform: 'usedesk',
    metadata: strMap({ company: raw.company }),
    raw,
  }
}
