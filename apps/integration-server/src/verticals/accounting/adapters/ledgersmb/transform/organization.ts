/**
 * LedgerSMB organization transform.
 *
 * LedgerSMB does not expose a dedicated /organization or /company endpoint in
 * the v0 REST API. Company information is derived from the authenticated
 * session context — specifically from session details or from the `company`
 * field supplied during authentication.
 *
 * This transform converts the minimal company info available (name from the
 * session) into a canonical Organization object. The `extra` credentials
 * store the company database name as a proxy for the organization identifier.
 */

import type { Organization } from '../../../schema/organization'

export interface LedgerSMBCompanyInfo {
  company?: string
  name?: string
  [key: string]: unknown
}

export function transformOrganization(raw: LedgerSMBCompanyInfo): Organization {
  return {
    organizationCode: raw.company || undefined,
    name: raw.name || raw.company || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
