import { toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'

/**
 * A contact as GET /person/ ("list of contacts") and GET /person/{personId}/
 * ("contact detail") return it. Only fields the documented 200 examples carry.
 * Timestamps are ISO 8601 because every read sends `dateFormat=ISO8601`.
 */
export interface RawRaynetContact {
  id: number
  firstName?: string | null
  lastName?: string | null
  primaryRelationship?: {
    id?: number
    /** "[Job title]" in the PUT /person/ relationship schema. */
    type?: string | null
    company?: { id?: number; name?: string } | null
  } | null
  owner?: { id?: number; fullName?: string } | null
  contactInfo?: {
    email?: string | null
    email2?: string | null
    tel1?: string | null
    tel1Type?: string | null
    tel2?: string | null
    tel2Type?: string | null
  } | null
  privateAddress?: {
    city?: string | null
    country?: string | null
    countryCode?: string | null
    province?: string | null
    street?: string | null
    zipCode?: string | null
  } | null
  tags?: string[] | null
  'rowInfo.createdAt'?: string | null
  'rowInfo.updatedAt'?: string | null
  [key: string]: unknown
}

function idOf(ref: { id?: number } | null | undefined): string | undefined {
  return ref?.id != null ? String(ref.id) : undefined
}

function mobileOf(info: RawRaynetContact['contactInfo']): string | undefined {
  if (!info) return undefined
  if (info.tel1 && info.tel1Type === 'mobile') return info.tel1
  if (info.tel2 && info.tel2Type === 'mobile') return info.tel2
  return undefined
}

export function transformContact(raw: RawRaynetContact): Contact {
  const info = raw.contactInfo
  const addr = raw.privateAddress
  const name = [raw.firstName, raw.lastName].filter(Boolean).join(' ')
  return {
    id: String(raw.id),
    first_name: raw.firstName ?? undefined,
    last_name: raw.lastName ?? undefined,
    name: name || undefined,
    email: info?.email || undefined,
    phone: info?.tel1 || undefined,
    mobile: mobileOf(info),
    title: raw.primaryRelationship?.type || undefined,
    company_id: idOf(raw.primaryRelationship?.company),
    owner_id: idOf(raw.owner),
    tags: raw.tags ?? undefined,
    address: addr
      ? {
          line1: addr.street ?? undefined,
          city: addr.city ?? undefined,
          region: addr.province ?? undefined,
          postalCode: addr.zipCode ?? undefined,
          country: addr.countryCode ?? undefined,
        }
      : undefined,
    created_at: toIsoDatetime(raw['rowInfo.createdAt']),
    updated_at: toIsoDatetime(raw['rowInfo.updatedAt']),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.first_name !== undefined) out.firstName = data.first_name
  if (data.last_name !== undefined) out.lastName = data.last_name
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.mobile !== undefined) out.mobile = data.mobile
  if (data.company_id !== undefined) out.account = { id: Number(data.company_id) }
  return out
}
