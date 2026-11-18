/**
 * Openpay card → canonical PaymentMethod.
 *
 * Cards are read customer-scoped:
 *   GET /v1/{MERCHANT_ID}/customers/{CUSTOMER_ID}/cards
 *   GET /v1/{MERCHANT_ID}/customers/{CUSTOMER_ID}/cards/{CARD_ID}
 *
 * Fields from "Objeto Tarjeta" (https://documents.openpay.mx/docs/api/index.html):
 * id ("Identificador único de la tarjeta."), creation_date ("... en formato
 * ISO 8601"), holder_name, card_number, expiration_month ("Mes de expiración
 * tal como aparece en la tarjeta."), expiration_year ("Año de expiración tal
 * como aparece en la tarjeta."; the example is "20"), brand ("visa,
 * mastercard, carnet o american express"), type ("debit, credit, cash, etc."),
 * bank_name, bank_code, customer_id.
 *
 * Every row of the cards resource is a card, whatever its `type`, so the
 * canonical type is always 'card'. The object documents no metadata.
 *
 * The canonical id is "customerId:cardId", the form getPaymentMethod takes, so
 * a listed id can be read back.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { PaymentMethod } from '../../../schema/payment-method'
import { optString, requireId } from './shared'

export interface RawOpenpayCard {
  id?: string
  creation_date?: string
  holder_name?: string
  card_number?: string | number
  expiration_month?: string | number
  expiration_year?: string | number
  brand?: string
  type?: string
  bank_name?: string
  bank_code?: string
  customer_id?: string | null
  [k: string]: unknown
}

function digits(v: unknown): string | undefined {
  const s = typeof v === 'number' && Number.isInteger(v) ? String(v) : v
  return typeof s === 'string' && /^\d+$/.test(s) ? s : undefined
}

function expMonth(v: unknown): number | undefined {
  const d = digits(v)
  const n = d === undefined ? undefined : Number(d)
  return n !== undefined && n >= 1 && n <= 12 ? n : undefined
}

/** "Tal como aparece en la tarjeta": cards print the year as YY. */
function expYear(v: unknown): number | undefined {
  const d = digits(v)
  if (d === undefined) return undefined
  if (d.length === 2) return 2000 + Number(d)
  if (d.length === 4) return Number(d)
  return undefined
}

export function transformPaymentMethod(raw: RawOpenpayCard, customerId: string): PaymentMethod {
  const cardId = requireId(raw, 'card')
  const number = digits(raw.card_number)
  const metadata: Record<string, string> = {}
  const cardType = optString(raw.type)
  if (cardType) metadata['type'] = cardType
  const bankCode = optString(raw.bank_code)
  if (bankCode) metadata['bank_code'] = bankCode
  return {
    id: `${customerId}:${cardId}`,
    externalId: cardId,
    customerId,
    type: 'card',
    brand: optString(raw.brand),
    last4: number && number.length >= 4 ? number.slice(-4) : undefined,
    expMonth: expMonth(raw.expiration_month),
    expYear: expYear(raw.expiration_year),
    holderName: optString(raw.holder_name),
    bankName: optString(raw.bank_name),
    gateway: 'openpay',
    metadata,
    createdAt: toIsoDatetime(raw.creation_date),
    raw,
  }
}
