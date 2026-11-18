/**
 * RealBooks → canonical Contact transform.
 *
 * Contacts in RealBooks are called "Ledgers" (ledger masters).  A ledger can
 * be a party of type "Sundry Debtors" (customer), "Sundry Creditors"
 * (supplier), or a generic account ledger.
 *
 * Endpoints:
 *   Create/update: POST /AMSSERVICE/api/ledger/update/ledgerdetails/{cid}/{segid}
 *   Fetch by name:  POST /AMSSERVICE/api/ledger/lgname/srchlname
 */

import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

// ── RealBooks wire types ──────────────────────────────────────────────────────

export interface RealBooksPartyDetails {
  contactPerson?: string
  address?: string
  phone?: string
  email?: string
  pan?: string
  vatno?: string
  tinNo?: string
  gstin?: string
  state_code?: string
  stateName?: string
  city?: string
  pinCode?: string
  country?: string
  fax?: string
  partyTypeName?: string
  partyRegType?: string
  bankName?: string
  bankaccNo?: string
  bankifsccode?: string
  [key: string]: unknown
}

export interface RealBooksLedger {
  id?: number
  ledgerName?: string
  printName?: string
  ledgerCode?: string
  ledgerGroupName?: string   // e.g. "Sundry Debtors", "Sundry Creditors"
  groupNature?: string       // e.g. "Asset", "Liability"
  sacCode?: string
  gstin?: string
  crLimit?: number
  crPeriod?: number
  partyDet?: RealBooksPartyDetails
  /** In some fetch responses the field may be named partyDetails */
  partyDetails?: RealBooksPartyDetails
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isCustomer(raw: RealBooksLedger): boolean {
  const grp = (raw.ledgerGroupName ?? '').toLowerCase()
  const nature = (raw.groupNature ?? '').toLowerCase()
  return grp.includes('debtor') || nature === 'asset'
}

function isSupplier(raw: RealBooksLedger): boolean {
  const grp = (raw.ledgerGroupName ?? '').toLowerCase()
  const nature = (raw.groupNature ?? '').toLowerCase()
  return grp.includes('creditor') || nature === 'liability'
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformContact(raw: RealBooksLedger): Contact {
  const party = raw.partyDet ?? raw.partyDetails ?? {}

  const emails = toWorkEmail(party.email)
  const telephones: Telephone[] = []
  if (party.phone) telephones.push({ telephone: party.phone, type: 'WORK' })
  if (party.fax) telephones.push({ telephone: party.fax, type: 'FAX' })

  // RealBooks address is a single string; put it in address1
  const billingAddress = toAddress({
    address1: party.address || undefined,
    city: party.city || undefined,
    postalCode: party.pinCode ? String(party.pinCode) : undefined,
    region: party.stateName || undefined,
    country: party.country || undefined,
  })

  return {
    id: raw.id !== undefined ? String(raw.id) : raw.ledgerCode || raw.ledgerName,
    name: raw.printName || raw.ledgerName || undefined,
    companyName: raw.ledgerName || undefined,
    identification: raw.ledgerCode || undefined,
    taxNumber: party.gstin || party.pan || party.vatno || undefined,
    isCustomer: isCustomer(raw),
    isSupplier: isSupplier(raw),
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Untransform (canonical → RealBooks ledger body) ───────────────────────────

export function untransformContact(contact: Partial<Contact>): Record<string, unknown> {
  const isSupp = contact.isSupplier && !contact.isCustomer
  return {
    id: 0,
    ledgerName: contact.name ?? contact.companyName ?? '',
    printName: contact.name ?? contact.companyName ?? '',
    ledgerCode: contact.identification ?? '',
    ledgerGroupName: isSupp ? 'Sundry Creditors' : 'Sundry Debtors',
    ledgerCategory: 'party',
    groupNature: isSupp ? 'Liability' : 'Asset',
    isBill: 'y',
    isCC: 'n',
    partyDet: {
      contactPerson: contact.name ?? '',
      email: contact.emails?.[0]?.email ?? '',
      phone: contact.telephones?.[0]?.telephone ?? '',
      gstin: contact.taxNumber ?? '',
      address: contact.billingAddress?.address1 ?? '',
      city: contact.billingAddress?.city ?? '',
      stateName: contact.billingAddress?.region ?? '',
      pinCode: contact.billingAddress?.postalCode ?? '',
      country: contact.billingAddress?.country ?? '',
    },
  }
}
