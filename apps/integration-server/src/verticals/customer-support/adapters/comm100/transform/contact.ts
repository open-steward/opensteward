/**
 * Comm100 contacts → canonical Contacts.
 *
 * https://developer.comm100.com/docs/server-api-global-setting-contact.
 * Contact JSON Format: id, name, firstName, lastName, createTime,
 * lastUpdatedTime, contactIdentities. Each identity carries a value and a
 * type whose "Allowed values are visitor , Email , SMS , facebook , ...".
 *
 * The page's JSON-format table calls the identity's type `type`, but every
 * documented response (GET /contact/contacts, GET /contact/contacts/{id},
 * POST /contact/contacts:query) spells it `contactIdentityType`, as does the
 * list's `contactIdentityType` filter. The response spelling is read.
 */
import { z } from 'zod'
import type { Contact } from '../../../schema'
import { pickStr, required, strMap, toIso } from './shared'

export interface RawComm100ContactIdentity {
  id?: string
  contactIdentityType?: string
  value?: string
  [key: string]: unknown
}

export interface RawComm100Contact {
  id?: string
  name?: string
  firstName?: string
  lastName?: string
  createTime?: string
  lastUpdatedTime?: string
  contactIdentities?: RawComm100ContactIdentity[] | null
  [key: string]: unknown
}

const Email = z.email()

function identity(raw: RawComm100Contact, type: string): string | undefined {
  if (!Array.isArray(raw.contactIdentities)) return undefined
  return pickStr(raw.contactIdentities.find((i) => i.contactIdentityType === type)?.value)
}

function contactName(raw: RawComm100Contact): string {
  const name = pickStr(raw.name)
  if (name !== undefined) return name
  return [pickStr(raw.firstName), pickStr(raw.lastName)].filter(Boolean).join(' ')
}

export function transformContact(raw: RawComm100Contact): Contact {
  const id = required(pickStr(raw.id), 'contact id')
  const email = identity(raw, 'Email')
  return {
    id,
    externalId: id,
    email: email !== undefined && Email.safeParse(email).success ? email : undefined,
    name: contactName(raw),
    // An SMS identity's value is the contact's number ("value": "+11111111" in the docs).
    phone: identity(raw, 'SMS'),
    platform: 'comm100',
    metadata: strMap({
      createTime: toIso(raw.createTime),
      lastUpdatedTime: toIso(raw.lastUpdatedTime),
    }),
    raw,
  }
}
