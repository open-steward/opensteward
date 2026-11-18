/**
 * Yuki organization transform.
 *
 * Yuki does not expose a dedicated "company info" endpoint in its SOAP API.
 * We synthesize an Organization record from the administrationId stored in
 * credentials.tenantId.  When Accounting.asmx → Administrations() is called
 * (optional flow) it returns <Administration> elements with Name and ID.
 *
 * Fields from Administrations() response (best-effort):
 *   AdministrationID   — numeric Yuki administration ID
 *   Name               — company / administration name
 *   CoCNumber          — Chamber of Commerce number
 *   VATNumber          — VAT identification number
 */

import type { Organization } from '../../../schema/organization'
import { extractFirst, extractBlocks, unescapeXml } from '../client'

// ── Yuki raw type ─────────────────────────────────────────────────────────────

export interface YukiAdministration {
  AdministrationID: string
  Name: string
  CoCNumber: string
  VATNumber: string
  [key: string]: unknown
}

// ── XML → YukiAdministration[] ───────────────────────────────────────────────

export function parseAdministrationsXml(innerXml: string): YukiAdministration[] {
  const blocks = extractBlocks(innerXml, 'Administration')
  return blocks.map((block) => ({
    AdministrationID: unescapeXml(extractFirst(block, 'AdministrationID')),
    Name: unescapeXml(extractFirst(block, 'Name')),
    CoCNumber: unescapeXml(extractFirst(block, 'CoCNumber')),
    VATNumber: unescapeXml(extractFirst(block, 'VATNumber')),
  }))
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrganization(raw: YukiAdministration): Organization {
  return {
    id: raw.AdministrationID || undefined,
    name: raw.Name || undefined,
    legalName: raw.Name || undefined,
    organizationCode: raw.CoCNumber || undefined,
    taxNumber: raw.VATNumber || undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Minimal fallback — build an Organization from the administrationId alone
 * when the Administrations() call is not available or returns no results.
 */
export function organizationFromCredentials(administrationId: string): Organization {
  return {
    id: administrationId || undefined,
    metadata: { administrationId },
  }
}
