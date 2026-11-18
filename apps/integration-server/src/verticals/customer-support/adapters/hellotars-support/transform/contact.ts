/**
 * Transform HelpDesk (by LiveChat) requester/contact to canonical Contact.
 *
 * HelpDesk doesn't expose a dedicated /contacts endpoint; requester details
 * are embedded in ticket objects. This transform handles a requester object
 * extracted from a ticket.
 *
 * Docs: https://api.helpdesk.com/docs#tag/Tickets
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawHelpdeskContact {
  ID?: string | null
  id?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  [key: string]: unknown
}

export function transformContact(raw: RawHelpdeskContact): Contact {
  const id = pickStr(raw.ID) ?? pickStr(raw.id) ?? ''
  return {
    id,
    externalId: id,
    email: pickStr(raw.email),
    name: pickStr(raw.name) ?? '',
    phone: pickStr(raw.phone),
    organizationId: undefined,
    platform: 'hellotars-support',
    metadata: strMap({}),
    raw,
  }
}
