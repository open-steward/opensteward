/**
 * Openpay customer → canonical Customer.
 *
 * Fields from "Objeto Cliente" (https://documents.openpay.mx/docs/api/index.html):
 * id ("Identificador único del cliente."), creation_date ("Fecha y hora en que
 * se creó el cliente en formato ISO 8601"), name ("Nombre del cliente."),
 * last_name ("Apellidos del cliente."), email, phone_number, status ("active o
 * deleted"), balance, clabe, address, store.
 *
 * `balance` ("Saldo en la cuenta con dos decimales.") is the customer's own
 * Openpay wallet, not an amount owed, and carries no currency, so it is not
 * mapped to the canonical `balance`.
 */
import type { Customer } from '../../../schema/customer'
import { optString, requireId } from './shared'

export interface RawOpenpayCustomer {
  id?: string
  creation_date?: string
  name?: string
  last_name?: string | null
  email?: string | null
  phone_number?: string | number | null
  status?: string
  [k: string]: unknown
}

export function transformCustomer(raw: RawOpenpayCustomer): Customer {
  const id = requireId(raw, 'customer')
  const fullName = [optString(raw.name), optString(raw.last_name)].filter(Boolean).join(' ')
  const status = optString(raw.status)
  return {
    id,
    externalId: id,
    email: optString(raw.email),
    name: fullName || undefined,
    phone:
      typeof raw.phone_number === 'number' && Number.isFinite(raw.phone_number)
        ? String(raw.phone_number)
        : optString(raw.phone_number),
    gateway: 'openpay',
    metadata: status ? { status } : {},
    createdAt: optString(raw.creation_date),
    raw,
  }
}
