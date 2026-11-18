/**
 * Transforms an Omnidesk user (contact/end-user) to the canonical Contact schema.
 *
 * Omnidesk user fields: user_id, user_full_name, user_email, user_phone,
 * company_name, active, deleted, created_at, updated_at.
 */
import type { Contact } from '../../../schema'
import { pickStr, strMap } from './shared'

export interface RawOmnideskUser {
  user_id: number
  user_full_name?: string
  user_email?: string
  user_phone?: string | null
  company_name?: string | null
  company_position?: string | null
  active?: boolean
  deleted?: boolean
  [key: string]: unknown
}

export function transformContact(raw: RawOmnideskUser): Contact {
  return {
    id: String(raw.user_id),
    externalId: String(raw.user_id),
    email: pickStr(raw.user_email),
    name: pickStr(raw.user_full_name) ?? '',
    phone: pickStr(raw.user_phone),
    organizationId: undefined, // Omnidesk stores company as a string field, not a separate entity
    platform: 'omnidesk',
    metadata: strMap({
      companyName: raw.company_name,
      companyPosition: raw.company_position,
      active: raw.active,
    }),
    raw,
  }
}
