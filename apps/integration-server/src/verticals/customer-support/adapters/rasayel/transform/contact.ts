/**
 * Transform a Rasayel ChannelUser into the canonical Contact shape.
 *
 * Fields read, as `type ChannelUser` declares them
 * (https://developers.rasayel.io/types/ChannelUser):
 *   id: Int!, uuid: String!, displayName: String,
 *   identifiers: [ChannelUserSourceIdentifier!]!
 * with `type ChannelUserSourceIdentifier { category:
 * ChannelUserIdentifierSourceEnum! sourceId: String! }`, whose enum includes
 * PHONE and EMAIL. The top-level `email` and `phone` fields are deprecated
 * ("find EMAIL identifier in ChannelUser.identifiers field instead", "find
 * PHONE identifier in ChannelUser.identifiers field instead") and not read.
 *
 * `name` is the documented `displayName`: the `channel_user.created` webhook
 * example (https://developers.rasayel.io/webhooks/channel-user-created) has
 * `"name": null` beside `"displayName": "Ahmed Abbas"`. A contact without one
 * gets an empty name.
 */
import { z } from 'zod'
import type { Contact } from '../../../schema'

export interface RawRasayelChannelUser {
  id: number
  uuid: string
  displayName?: string | null
  identifiers: Array<{ category: string; sourceId: string }>
}

const Email = z.email()

function identifier(raw: RawRasayelChannelUser, category: string): string | undefined {
  return raw.identifiers.find((i) => i.category === category)?.sourceId
}

export function transformContact(raw: RawRasayelChannelUser): Contact {
  const email = identifier(raw, 'EMAIL')
  const phone = identifier(raw, 'PHONE')
  return {
    id: String(raw.id),
    externalId: raw.uuid,
    ...(email !== undefined && Email.safeParse(email).success ? { email } : {}),
    name: raw.displayName ?? '',
    ...(phone ? { phone } : {}),
    platform: 'rasayel',
    metadata: {},
    raw,
  }
}
