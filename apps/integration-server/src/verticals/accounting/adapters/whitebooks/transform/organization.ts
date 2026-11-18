/**
 * WhiteBooks GSTIN details ↔ canonical Organization transform.
 *
 * The authenticated company's GSTIN data is fetched via:
 *   GET /gst/type/GSTNDETAILS/version/V1_03?gstin=<GSTIN>
 *
 * The same NIC GSTN schema is re-used here at the Organisation level.
 * Currency is always INR for Indian businesses.
 */

import type { Organization } from '../../../schema/organization'
import type { WhitebooksGstinDtls } from './contact'
import { toAddress } from '../../shared/transform'

export type { WhitebooksGstinDtls as WhitebooksOrgDtls }

export function transformOrganization(raw: WhitebooksGstinDtls): Organization {
  const name = raw.lgnm || raw.trdnm || undefined
  const addr = raw.pradr?.addr

  const address = toAddress({
    address1: [addr?.bno, addr?.bnm, addr?.st].filter(Boolean).join(', ') || undefined,
    address2: addr?.flno || undefined,
    city: addr?.loc || undefined,
    region: addr?.stcd || undefined,
    postalCode: addr?.pncd || undefined,
    country: 'IN',
  })

  return {
    name,
    legalName: raw.lgnm || undefined,
    taxNumber: raw.gstin || undefined,
    currency: 'INR',
    address: address || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
