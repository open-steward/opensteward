/**
 * WhiteBooks GSTIN details ↔ canonical Contact transforms.
 *
 * WhiteBooks exposes GSTIN verification via:
 *   GET /gst/type/GSTNDETAILS/version/V1_03?gstin=<GSTIN>
 *
 * The response wraps NIC GSTN master data. We surface it as a Contact
 * (isCustomer=true) so downstream systems can look up party information.
 * All fields are optional — the transform never throws.
 */

import type { Contact } from '../../../schema/contact'
import { toAddress, nonempty } from '../../shared/transform'

// ── WhiteBooks GSTIN detail types ─────────────────────────────────────────────

export interface WhitebooksGstinAddr {
  bnm?: string   // building name
  st?: string    // street
  loc?: string   // locality
  bno?: string   // building number
  dst?: string   // district
  stcd?: string  // state code
  pncd?: string  // PIN code
  lt?: string    // latitude (string)
  lg?: string    // longitude
  flno?: string  // floor number
}

export interface WhitebooksGstinDtls {
  gstin?: string
  lgnm?: string  // legal name
  trdnm?: string // trade name
  rgdt?: string  // registration date "DD/MM/YYYY"
  cxdt?: string  // cancellation date "DD/MM/YYYY"
  sts?: string   // "Active" | "Cancelled" | etc.
  pradr?: {
    addr?: WhitebooksGstinAddr
    ntr?: string // nature of business
  }
  einvoiceStatus?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseGstDate(val?: string | null): Date | undefined {
  if (!val) return undefined
  try {
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
      const [d, m, y] = val.split('/')
      return new Date(`${y}-${m}-${d}T00:00:00Z`)
    }
    const dt = new Date(val)
    return isNaN(dt.getTime()) ? undefined : dt
  } catch {
    return undefined
  }
}

// ── Public transform ──────────────────────────────────────────────────────────

export function transformGstinContact(raw: WhitebooksGstinDtls): Contact {
  const name = raw.lgnm || raw.trdnm || undefined
  const addr = raw.pradr?.addr

  const billingAddress = toAddress({
    address1: [addr?.bno, addr?.bnm, addr?.st].filter(Boolean).join(', ') || undefined,
    address2: addr?.flno || undefined,
    city: addr?.loc || undefined,
    region: addr?.stcd || undefined,
    postalCode: addr?.pncd || undefined,
    country: 'IN',
  })

  const cancelledAt = parseGstDate(raw.cxdt)
  const createdAt = parseGstDate(raw.rgdt)
  const isActive = !cancelledAt && (raw.sts ?? '').toLowerCase() === 'active'

  return {
    id: raw.gstin || undefined,
    name,
    companyName: raw.trdnm || raw.lgnm || undefined,
    identification: raw.gstin || undefined,
    taxNumber: raw.gstin || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive,
    billingAddress: billingAddress || undefined,
    emails: nonempty([]),
    createdAt: createdAt ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}
