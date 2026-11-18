/**
 * Clarify uses "person" as the object type for contacts.
 *
 * Record response shape (attributes):
 *   first_name, last_name, name, email_addresses (array of {value,type}),
 *   phone_numbers (array of {value,type}), title, company_id,
 *   owner_id, created_at, updated_at
 */

import type { Contact } from '../../../schema/contact'

export interface ClarifyEmailEntry {
  value: string
  type?: string
}

export interface ClarifyPhoneEntry {
  value: string
  type?: string
}

export interface RawClarifyPersonAttributes {
  first_name?: string
  last_name?: string
  name?: string
  email_addresses?: ClarifyEmailEntry[] | string[]
  phone_numbers?: ClarifyPhoneEntry[] | string[]
  title?: string
  company_id?: string
  owner_id?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface RawClarifyPerson {
  id: string
  type?: string
  attributes: RawClarifyPersonAttributes
  [key: string]: unknown
}

function pickEmail(emails: ClarifyEmailEntry[] | string[] | undefined): string | undefined {
  if (!emails || emails.length === 0) return undefined
  const first = emails[0]
  if (typeof first === 'string') return first
  return (first as ClarifyEmailEntry).value
}

function pickPhone(phones: ClarifyPhoneEntry[] | string[] | undefined): string | undefined {
  if (!phones || phones.length === 0) return undefined
  const first = phones[0]
  if (typeof first === 'string') return first
  return (first as ClarifyPhoneEntry).value
}

export function transformContact(raw: RawClarifyPerson): Contact {
  const a = raw.attributes
  const nameParts = [a.first_name, a.last_name].filter(Boolean)
  return {
    id: String(raw.id),
    first_name: a.first_name ?? undefined,
    last_name: a.last_name ?? undefined,
    name: a.name ?? (nameParts.length > 0 ? nameParts.join(' ') : undefined),
    email: pickEmail(a.email_addresses),
    phone: pickPhone(a.phone_numbers),
    title: a.title ?? undefined,
    company_id: a.company_id ?? undefined,
    owner_id: a.owner_id ?? undefined,
    created_at: a.created_at ?? undefined,
    updated_at: a.updated_at ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  if (data.first_name !== undefined) attributes.first_name = data.first_name
  if (data.last_name !== undefined) attributes.last_name = data.last_name
  if (data.email !== undefined) attributes.email_addresses = [{ value: data.email, type: 'work' }]
  if (data.phone !== undefined) attributes.phone_numbers = [{ value: data.phone, type: 'work' }]
  if (data.title !== undefined) attributes.title = data.title
  if (data.company_id !== undefined) attributes.company_id = data.company_id
  if (data.owner_id !== undefined) attributes.owner_id = data.owner_id
  return {
    data: {
      type: 'person',
      attributes,
    },
  }
}
