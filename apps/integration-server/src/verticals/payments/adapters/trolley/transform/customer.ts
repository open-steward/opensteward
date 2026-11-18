/**
 * Trolley Recipient → canonical Customer.
 *
 * Trolley pays out to recipients; a recipient is the counterparty record, so
 * it maps onto Customer. Fields read are the ones in the documented Recipient
 * object ("Retrieve a recipient" / "List all recipients" example responses,
 * https://developers.trolley.com/api/): `id`, `referenceId`, `email`, `name`,
 * `type`, `status`, `complianceStatus`, `payoutMethod`, `createdAt`,
 * `updatedAt`.
 */
import type { Customer } from '../../../schema/customer'

export interface RawTrolleyRecipient {
  id?: string | null
  referenceId?: string | null
  email?: string | null
  name?: string | null
  firstName?: string | null
  lastName?: string | null
  type?: string | null
  status?: string | null
  complianceStatus?: string | null
  payoutMethod?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [k: string]: unknown
}

function text(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}

export function transformCustomer(raw: RawTrolleyRecipient): Customer {
  const id = text(raw.id)
  if (!id) throw new Error('Trolley recipient has no id')
  const metadata: Record<string, string> = {}
  for (const k of ['referenceId', 'type', 'status', 'complianceStatus', 'payoutMethod'] as const) {
    const v = text(raw[k])
    if (v) metadata[k] = v
  }
  return {
    id,
    externalId: id,
    email: text(raw.email),
    name: text(raw.name),
    gateway: 'trolley',
    metadata,
    createdAt: text(raw.createdAt),
    updatedAt: text(raw.updatedAt),
    raw,
  }
}
