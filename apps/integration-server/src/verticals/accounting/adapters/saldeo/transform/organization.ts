/**
 * SaldeoSMART company → canonical Organization transform.
 *
 * company.list returns a list of COMPANY elements (one per SaldeoSMART
 * "office client"). The adapter returns the first company as the
 * organization when credentials are scoped to a single account.
 *
 * XML field map (inferred from API spec + esiable/saldeo-proxy code):
 *   COMPANY_PROGRAM_ID  → organizationCode (unique client identifier)
 *   COMPANY_ID          → id (internal numeric id)
 *   NAME                → name / legalName
 *   NIP                 → taxNumber (Polish VAT number)
 *   (address fields not documented in company.list; omitted)
 */

import type { Organization } from '../../../schema/organization'
import { xmlTag } from '../client'

export interface SaldeoCompany {
  COMPANY_ID?: string
  COMPANY_PROGRAM_ID?: string
  NAME?: string
  NIP?: string
  _raw: string
}

export function parseSaldeoCompany(xml: string): SaldeoCompany {
  return {
    COMPANY_ID: xmlTag(xml, 'COMPANY_ID'),
    COMPANY_PROGRAM_ID: xmlTag(xml, 'COMPANY_PROGRAM_ID'),
    NAME: xmlTag(xml, 'NAME'),
    NIP: xmlTag(xml, 'NIP'),
    _raw: xml,
  }
}

export function transformOrganization(raw: SaldeoCompany): Organization {
  return {
    id: raw.COMPANY_PROGRAM_ID || raw.COMPANY_ID || undefined,
    name: raw.NAME || undefined,
    legalName: raw.NAME || undefined,
    organizationCode: raw.COMPANY_PROGRAM_ID || undefined,
    taxNumber: raw.NIP || undefined,
    metadata: { _xml: raw._raw } as Record<string, unknown>,
  }
}
