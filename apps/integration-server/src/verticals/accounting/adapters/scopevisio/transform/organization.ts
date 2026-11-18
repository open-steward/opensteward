/**
 * Scopevisio accountinginfo → canonical Organization transform.
 *
 * Scopevisio field notes (GET /accountinginfo → AccountInfo):
 *  - `.customer.name`          : Scopevisio customer / tenant name
 *  - `.customer.publicId`      : public customer identifier
 *  - `.organisation.id`        : numeric organisation ID
 *  - `.organisation.name`      : organisation name (Firma)
 *
 * The /accountinginfo endpoint does not expose a postal address, VAT number,
 * or fiscal year end.  Those fields are omitted (left undefined).
 *
 * Endpoint: GET /accountinginfo
 *
 * Docs: https://appload.scopevisio.com/rest/swagger.json
 */

import type { Organization } from '../../../schema/organization'

export interface ScopevisioCustomerInfo {
  publicId?: string
  name?: string
  status?: string
}

export interface ScopevisioOrganisationInfo {
  id?: number
  name?: string
  teamworkTenantId?: string
  teamworkTenantName?: string
}

export interface ScopevisioAccountingInfo {
  customer?: ScopevisioCustomerInfo
  organisation?: ScopevisioOrganisationInfo
  [key: string]: unknown
}

export function transformOrganization(raw: ScopevisioAccountingInfo): Organization {
  const orgId = raw.organisation?.id !== undefined ? String(raw.organisation.id) : undefined

  return {
    id: orgId,
    name: raw.organisation?.name || raw.customer?.name || undefined,
    legalName: raw.organisation?.name || undefined,
    organizationCode: raw.customer?.publicId || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
