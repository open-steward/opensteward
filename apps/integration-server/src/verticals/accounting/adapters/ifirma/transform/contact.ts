/**
 * iFirma contact transforms.
 *
 * Search/list:  GET  /iapi/kontrahenci/{phrase}.json  (key: faktura)
 * Get by id:    GET  /iapi/kontrahenci/id/{id}.json   (key: faktura)
 * Create:       POST /iapi/kontrahenci.json           (key: faktura)
 *
 * iFirma uses a single contractor (kontrahent) model — the JestDostawca /
 * JestOdbiorca booleans indicate supplier vs. customer role.
 */
import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

// ── Raw type ──────────────────────────────────────────────────────────────────

export interface IfirmaKontrahent {
  Identyfikator: string
  Nazwa: string
  NIP: string
  Ulica: string
  KodPocztowy: string
  Miejscowosc: string
  Email: string
  Telefon: string
  OsobaFizyczna: boolean
  ZgodaNaEfaktury: boolean
  JestDostawca: boolean
  JestOdbiorca: boolean   // customer/recipient
  Www?: string
  PrefiksUE?: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformContact(raw: IfirmaKontrahent): Contact {
  const emails = toWorkEmail(raw.Email)
  const telephones = raw.Telefon
    ? [{ telephone: raw.Telefon, type: 'WORK' as const }]
    : []

  return {
    id: raw.Identyfikator,
    name: raw.Nazwa || undefined,
    taxNumber: raw.NIP || undefined,
    isCustomer: raw.JestOdbiorca ?? true,
    isSupplier: raw.JestDostawca ?? false,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.Ulica,
      city: raw.Miejscowosc,
      postalCode: raw.KodPocztowy,
    }),
    metadata: raw as Record<string, unknown>,
  }
}

// ── Untransform (canonical → iFirma POST body) ────────────────────────────────

export function untransformContact(contact: Partial<Contact>): Record<string, unknown> {
  return {
    Nazwa: contact.name ?? '',
    NIP: contact.taxNumber,
    Email: contact.emails?.[0]?.email,
    Telefon: contact.telephones?.[0]?.telephone,
    Ulica: contact.billingAddress?.address1,
    KodPocztowy: contact.billingAddress?.postalCode ?? '',
    Miejscowosc: contact.billingAddress?.city ?? '',
    OsobaFizyczna: false,
    ZgodaNaEfaktury: false,
    JestDostawca: contact.isSupplier ?? false,
    JestOdbiorca: contact.isCustomer ?? true,
  }
}
