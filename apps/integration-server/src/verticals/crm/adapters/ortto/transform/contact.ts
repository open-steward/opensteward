import type { Contact } from '../../../schema/contact'

// TODO: Confirm field names — Ortto uses a custom field model where
// fields are nested under a "fields" object with Ortto-specific keys.
// The structure below assumes standard Ortto person record shape.
export interface RawOrttoContact {
  id?: string
  fields?: {
    'str::first'?: { v?: string }
    'str::last'?: { v?: string }
    'str::email'?: { v?: string }
    'phn::phone'?: { v?: string }
    'str::title'?: { v?: string }
    'acc:org::name'?: { v?: string }
  }
  created_time?: string
  updated_time?: string
  [key: string]: unknown
}

export function transformContact(raw: RawOrttoContact): Contact {
  const f = raw.fields ?? {}
  const firstName = f['str::first']?.v
  const lastName = f['str::last']?.v
  return {
    id: String(raw.id ?? ''),
    first_name: firstName,
    last_name: lastName,
    name: [firstName, lastName].filter(Boolean).join(' ') || undefined,
    email: f['str::email']?.v,
    phone: f['phn::phone']?.v,
    title: f['str::title']?.v,
    created_at: raw.created_time,
    updated_at: raw.updated_time,
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  if (data.first_name !== undefined) fields['str::first'] = { v: data.first_name }
  if (data.last_name !== undefined) fields['str::last'] = { v: data.last_name }
  if (data.email !== undefined) fields['str::email'] = { v: data.email }
  if (data.phone !== undefined) fields['phn::phone'] = { v: data.phone }
  if (data.title !== undefined) fields['str::title'] = { v: data.title }
  return { fields }
}
