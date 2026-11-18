import type { Contact } from '../../../schema/contact'
import { type MondayItem, getColumnValue } from '../client'

/** Split a full name string into first/last (best-effort). */
function splitName(name: string): { first_name?: string; last_name?: string } {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return {}
  if (parts.length === 1) return { first_name: parts[0] }
  return {
    first_name: parts.slice(0, -1).join(' '),
    last_name: parts[parts.length - 1],
  }
}

export function transformContact(raw: MondayItem): Contact {
  const { first_name, last_name } = splitName(raw.name)
  return {
    id: raw.id,
    first_name,
    last_name,
    name: raw.name || undefined,
    email: getColumnValue(raw, 'email'),
    phone: getColumnValue(raw, 'phone'),
    title: getColumnValue(raw, 'status'),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const columnValues: Record<string, unknown> = {}
  if (data.email !== undefined) columnValues['email'] = { email: data.email, text: data.email }
  if (data.phone !== undefined) columnValues['phone'] = data.phone
  if (data.title !== undefined) columnValues['status'] = { label: data.title }
  return {
    name: data.name ?? [data.first_name, data.last_name].filter(Boolean).join(' '),
    column_values: JSON.stringify(columnValues),
  }
}
