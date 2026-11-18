/**
 * Talkdesk Contact → canonical Contact transform.
 *
 * Talkdesk Contacts API field reference:
 *   id           — UUID string
 *   name         — string
 *   emails       — Array<{ email: string; type?: string }> | null
 *   phones       — Array<{ phone_number: string; type?: string }> | null
 *   company      — string | null
 *   photo_url    — string | null
 *   created_at   — ISO-8601 string
 *   updated_at   — ISO-8601 string
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

interface TalkdeskEmail {
  email?: string
  type?: string
}

interface TalkdeskPhone {
  phone_number?: string
  type?: string
}

export interface RawTalkdeskContact {
  id: string
  name?: string | null
  emails?: TalkdeskEmail[] | null
  phones?: TalkdeskPhone[] | null
  company?: string | null
  photo_url?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function primaryEmail(emails: TalkdeskEmail[] | null | undefined): string | undefined {
  if (!emails || emails.length === 0) return undefined
  // prefer type=work or first entry
  const work = emails.find((e) => e.type === 'work')
  return pickStr((work ?? emails[0])?.email)
}

function primaryPhone(phones: TalkdeskPhone[] | null | undefined): string | undefined {
  if (!phones || phones.length === 0) return undefined
  const work = phones.find((p) => p.type === 'work')
  return pickStr((work ?? phones[0])?.phone_number)
}

export function transformContact(raw: RawTalkdeskContact): Contact {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: primaryEmail(raw.emails),
    name: pickStr(raw.name) ?? '',
    phone: primaryPhone(raw.phones),
    platform: 'talkdesk',
    metadata: strMap({
      company: raw.company,
      createdAt: toIso(raw.created_at),
      updatedAt: toIso(raw.updated_at),
    }),
    raw,
  }
}
