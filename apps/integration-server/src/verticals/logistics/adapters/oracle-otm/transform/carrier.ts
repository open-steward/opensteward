/**
 * Oracle Transportation Management (OTM) Service Provider → canonical Carrier.
 *
 * OTM models carriers as "Service Providers" accessible via:
 *   GET /serviceProviders            (list)
 *   GET /serviceProviders/{servprovGid}  (single)
 *
 * Docs: https://docs.oracle.com/en/cloud/saas/transportation/26a/otmra/api-business-objects-service-providers.html
 */

import type { Carrier } from '../../../schema/carrier'
import { toISODate } from '../../shared/transform'

export interface OracleOtmServiceProviderResponse {
  servprovGid?: string
  servprovXid?: string
  domainName?: string
  isActive?: boolean
  scacGid?: string
  modeProfileGid?: string
  insertDate?: { value?: string }
  updateDate?: { value?: string }
  [key: string]: unknown
}

export interface OracleOtmServiceProvidersListResponse {
  items?: OracleOtmServiceProviderResponse[]
  count?: number
  hasMore?: boolean
  totalResults?: number
  links?: unknown[]
  [key: string]: unknown
}

export function transformCarrier(raw: OracleOtmServiceProviderResponse): Carrier {
  // servprovXid is the human-readable identifier (the part after the domain prefix)
  const xid = raw.servprovXid ?? undefined
  // scacGid has the form "DOMAIN.SCAC" — strip the domain prefix if present
  const scac = raw.scacGid
    ? raw.scacGid.includes('.')
      ? raw.scacGid.split('.').slice(1).join('.')
      : raw.scacGid
    : undefined

  return {
    id: raw.servprovGid ?? undefined,
    name: xid,
    code: scac ?? xid,
    isActive: raw.isActive ?? undefined,
    createdAt: toISODate(raw.insertDate?.value),
    updatedAt: toISODate(raw.updateDate?.value),
    metadata: raw as Record<string, unknown>,
  }
}
