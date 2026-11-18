import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

/**
 * Calxa entity (organisation) as returned by GET /entities/:id or
 * GET /entities/current. Calxa calls top-level companies "entities". Each
 * entity corresponds to a single connected accounting data source (e.g. a
 * Xero organisation or a QuickBooks company file).
 */
export interface CalxaEntity {
  id: string
  name: string
  /** Legal / registered trading name, when set. */
  legalName?: string
  /** ABN / ACN / tax number as entered in the connected accounting system. */
  taxNumber?: string
  /** ISO 4217 base currency for this entity. */
  currency?: string
  /** IANA time zone, e.g. "Australia/Sydney". */
  timezone?: string
  /** Public website URL. */
  website?: string
  /** Financial year end month (1–12). */
  fiscalYearEnd?: number
  address?: {
    line1?: string
    line2?: string
    city?: string
    region?: string
    postalCode?: string
    country?: string
  }
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformOrganization(raw: CalxaEntity): Organization {
  return {
    id: raw.id,
    name: raw.name || undefined,
    legalName: raw.legalName || undefined,
    taxNumber: raw.taxNumber || undefined,
    currency: raw.currency || undefined,
    timezone: raw.timezone || undefined,
    website: raw.website || undefined,
    fiscalYearEndMonth: raw.fiscalYearEnd || undefined,
    address: raw.address
      ? toAddress({
          address1: raw.address.line1,
          address2: raw.address.line2,
          city: raw.address.city,
          region: raw.address.region,
          postalCode: raw.address.postalCode,
          country: raw.address.country,
        })
      : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
