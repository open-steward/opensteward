import { toIsoDatetime } from '@opensteward/shared'
import { limeObjectId } from '../object-id'
import type { Company } from '../../../schema/company'

/**
 * System properties: "_id: the id of the limeobject", "_createdtime: the
 * timestamp of the creation time", "_timestamp: the timestamp of the latest
 * update" (https://platform.docs.lime-crm.com/en/latest/development/tutorials/concepts/limetypes-and-limeobjects/).
 * Other fields per the Limeobject API definitions
 * (http://static.lime-crm.com/crm-api-docs/spec/limeobject).
 */
export interface RawLimeCrmCompany {
  _id: number | string
  _createdtime?: string
  _timestamp?: string
  /** "title: \"Company name\"", a required property. */
  name?: string
  /** "title: \"Telephone\"" */
  phone?: string
  /** "title: \"Homepage\"" */
  www?: string
  [key: string]: unknown
}

/**
 * `www` is the "Homepage" (a URL); the canonical `domain` is the "Primary
 * web domain (e.g. `example.com`)", so only the host of the homepage is
 * kept. A value that does not parse as a host is left out (it stays in
 * metadata).
 */
function domainOf(www: string | undefined): string | undefined {
  const value = www?.trim()
  if (!value) return undefined
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`)
      .hostname
    return host.includes('.') ? host : undefined
  } catch {
    return undefined
  }
}

export function transformCompany(raw: RawLimeCrmCompany): Company {
  return {
    id: limeObjectId(raw),
    name: raw.name ?? '',
    phone: raw.phone,
    domain: domainOf(raw.www),
    created_at: toIsoDatetime(raw._createdtime),
    updated_at: toIsoDatetime(raw._timestamp),
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (data.name !== undefined) out.name = data.name
  if (data.phone !== undefined) out.phone = data.phone
  if (data.domain !== undefined) out.webpage = data.domain
  return out
}
