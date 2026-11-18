/**
 * Transform a Yellow.ai user (User360 record) → canonical Contact.
 *
 * Source: "Get user details", GET /cdp/api/v1/user/{userId}
 * (https://docs.yellow.ai/api/get-user-details), answering
 * `{ message, data }` where every property of `data` is
 * `{ value, propertyType }`. The property names are the user properties
 * documented on Add user (https://docs.yellow.ai/api/add-user): "userId
 * Unique identifier of the user.", "firstName The first name of the user.",
 * "lastName Last name of the user.", "email Email address of the user.",
 * "phone Phone number of the user with country code."
 *
 * Geo, opt-in and tag properties are not copied: the Contact schema refuses
 * them.
 */
import type { Contact } from '../../../schema'

export interface RawYellowAiProperty {
  value?: unknown
  propertyType?: string
}

export type RawYellowAiContact = Record<string, RawYellowAiProperty | undefined>

function prop(raw: RawYellowAiContact, name: string): string | undefined {
  const v = raw[name]?.value
  return typeof v === 'string' && v !== '' ? v : undefined
}

export function transformContact(raw: RawYellowAiContact): Contact {
  const id = prop(raw, 'userId')
  if (!id) throw new Error('yellow-ai user has no userId property')
  const email = prop(raw, 'email')
  const phone = prop(raw, 'phone')
  return {
    id,
    externalId: id,
    ...(email ? { email } : {}),
    name: [prop(raw, 'firstName'), prop(raw, 'lastName')].filter(Boolean).join(' '),
    ...(phone ? { phone } : {}),
    platform: 'yellow-ai',
    metadata: {},
    raw,
  }
}
