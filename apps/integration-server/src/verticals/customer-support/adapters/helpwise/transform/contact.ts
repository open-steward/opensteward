/**
 * Helpwise contact -> canonical Contact transform.
 *
 * Documented V1 shapes (https://documenter.getpostman.com/view/29744652/2s9YC5yYKf):
 *
 * - "List Contact" (GET /contacts) rows: `firstname`, `middlename`,
 *   `lastname`, `jobTitle`, `company`, `emails` (array), `phones` (array), `id`.
 * - "Get Contact" (GET /contacts/{contactId}): `id`, `firstname`,
 *   `displayName`, `emails`, `phones`, ...
 *
 * The name is built from the name parts both shapes carry. The documented
 * examples show `emails` as strings and `phones` only empty, so a phone is
 * read only when the first element is a string.
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHelpwiseContact {
  id: number | string
  firstname?: string | null
  middlename?: string | null
  lastname?: string | null
  jobTitle?: string | null
  company?: string | null
  emails?: unknown[]
  phones?: unknown[]
  [key: string]: unknown
}

function firstString(list: unknown[] | undefined): string | undefined {
  const v = Array.isArray(list) ? list[0] : undefined
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

export function transformContact(raw: RawHelpwiseContact): Contact {
  if (raw.id === undefined || raw.id === null || raw.id === '') {
    throw new Error('Helpwise contact has no contact id')
  }
  const name = [raw.firstname, raw.middlename, raw.lastname]
    .map(pickStr)
    .filter((s): s is string => s !== undefined)
    .join(' ')
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: firstString(raw.emails),
    name,
    phone: firstString(raw.phones),
    organizationId: undefined,
    platform: 'helpwise',
    metadata: strMap({ company: pickStr(raw.company), jobTitle: pickStr(raw.jobTitle) }),
    raw,
  }
}
