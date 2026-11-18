/**
 * Transform a raw Take Blip contact (LIME contact resource) to the canonical
 * Contact schema.
 *
 * Contacts are returned from GET /contacts and GET /contacts/{identity}, sent
 * to postmaster@crm.msging.net (docs.blip.ai, "Contacts").
 *
 * The documented contact properties are: identity, name, gender, group,
 * address, city, email, phoneNumber, cellPhoneNumber, timezone, culture,
 * extras, source, lastMessageDate, taxDocument, isPending, sharePresence and
 * shareAccountInfo. Only those are read.
 *
 * Docs: https://docs.blip.ai/#contacts
 */
import { z } from 'zod'
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawTakeBlipContact {
  identity?: string
  name?: string
  email?: string | null
  phoneNumber?: string | null
  cellPhoneNumber?: string | null
  group?: string | null
  gender?: string | null
  address?: string | null
  city?: string | null
  culture?: string | null
  source?: string | null
  lastMessageDate?: string | null
  extras?: Record<string, unknown>
  [key: string]: unknown
}

const Email = z.email()

export function transformContact(raw: RawTakeBlipContact): Contact {
  // identity is the contact's id: "The client identity in a specific channel."
  const identity = pickStr(raw.identity)
  if (!identity) throw new Error('TakeBlip contact has no identity')
  const email = pickStr(raw.email)

  return {
    id: identity,
    externalId: identity,
    // email is a free string on the contact; only a valid address is surfaced.
    email: email !== undefined && Email.safeParse(email).success ? email : undefined,
    // name is optional on a Blip contact; the canonical name is required.
    name: pickStr(raw.name) ?? '',
    phone: pickStr(raw.phoneNumber),
    platform: 'take-blip',
    metadata: strMap({
      group: raw.group,
      gender: raw.gender,
      source: raw.source,
      address: raw.address,
      city: raw.city,
      culture: raw.culture,
      cellPhoneNumber: raw.cellPhoneNumber,
      lastMessageDate: raw.lastMessageDate,
    }),
    raw,
  }
}
