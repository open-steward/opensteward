/**
 * Misoca (Yayoi) contact transform.
 *
 * Misoca has two contact-related resources:
 *   - ContactGroup (取引先): /api/v3/contact_groups — represents a business partner
 *   - Contact (送り先):      /api/v3/contacts — represents a delivery destination
 *     within a contact group
 *
 * We map ContactGroup → canonical Contact (isCustomer=true) because it holds
 * the business-partner identity. Contacts (送り先) are address destinations and
 * are surfaced as billing/shipping addresses where present.
 *
 * ContactGroup fields:
 *   id, recipient_name, recipient_ruby, recipient_title, tax_option,
 *   peppol_id, bank_accounts[], mail_settings{}, created_at, updated_at
 *
 * Contact (destination) fields:
 *   id, contact_group_id, recipient_name, recipient_title, recipient_ruby,
 *   recipient_code, recipient_notes, recipient_mail_address,
 *   recipient_mail_address_cc, recipient_zip_code, recipient_address1,
 *   recipient_address2, recipient_name1..4, recipient_title2,
 *   recipient_tel_no, recipient_fax_no, memo
 *
 * Docs: https://doc.misoca.jp/v3/
 */

import type { Contact } from '../../../schema/contact'
import type { Email, Telephone, Address } from '../../../schema/shared'

// ── Misoca ContactGroup (取引先) ────────────────────────────────────────────

export interface MisocaContactGroup {
  id: number
  recipient_name?: string
  recipient_ruby?: string
  recipient_title?: string
  tax_option?: string
  peppol_id?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ── Misoca Contact / Destination (送り先) ──────────────────────────────────

export interface MisocaContact {
  id: number
  contact_group_id?: number
  recipient_name?: string
  recipient_title?: string
  recipient_ruby?: string
  recipient_code?: string
  recipient_notes?: string
  recipient_mail_address?: string
  recipient_mail_address_cc?: string
  recipient_zip_code?: string
  recipient_address1?: string
  recipient_address2?: string
  recipient_tel_no?: string
  recipient_fax_no?: string
  memo?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapAddress(raw: MisocaContact): Address | undefined {
  if (!raw.recipient_address1 && !raw.recipient_zip_code) return undefined
  return {
    address1: raw.recipient_address1 || undefined,
    address2: raw.recipient_address2 || undefined,
    postalCode: raw.recipient_zip_code || undefined,
    // Misoca does not provide city/country as separate fields
  }
}

export function transformContactGroup(raw: MisocaContactGroup): Contact {
  return {
    id: String(raw.id),
    name: raw.recipient_name || undefined,
    companyName: raw.recipient_name || undefined,
    isCustomer: true,
    isSupplier: false,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformContact(raw: MisocaContact): Contact {
  const emails: Email[] = raw.recipient_mail_address
    ? [{ email: raw.recipient_mail_address, type: 'WORK' }]
    : []
  const telephones: Telephone[] = []
  if (raw.recipient_tel_no) {
    telephones.push({ telephone: raw.recipient_tel_no, type: 'WORK' })
  }
  if (raw.recipient_fax_no) {
    telephones.push({ telephone: raw.recipient_fax_no, type: 'FAX' })
  }

  return {
    id: String(raw.id),
    name: raw.recipient_name || undefined,
    companyName: raw.recipient_name || undefined,
    identification: raw.recipient_code || undefined,
    isCustomer: true,
    isSupplier: false,
    emails: emails.length ? emails : undefined,
    telephones: telephones.length ? telephones : undefined,
    billingAddress: mapAddress(raw),
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
