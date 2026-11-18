/**
 * Maps an Orderful v3 relationship to the canonical Supplier schema.
 *
 * Orderful relationships represent EDI trading-partner pairings. Each
 * relationship has a sender (your org) and a receiver (the trading partner).
 * We surface the *receiver* as the supplier since from an inventory perspective
 * the receiver is the counterparty fulfilling orders.
 *
 * Relationship status values: BLOCKED | PENDING | SETUP | TEST | READY | LIVE
 *
 * Docs: https://docs.orderful.com/reference/relationshipcontroller_listv3.md
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, strMap} from './shared'

export interface RawOrderfulRelationshipIdentity {
  ediAccountId?: number
  liveIsaId?: string
  testIsaId?: string | null
  organizationId?: number
  organizationName?: string
  ediAccountName?: string
}

export interface RawOrderfulRelationship {
  id: number | string
  createdAt?: string
  updatedAt?: string
  sender?: RawOrderfulRelationshipIdentity
  receiver?: RawOrderfulRelationshipIdentity
  transactionType?: { name?: string }
  status?: string
  autoSend?: string
  [key: string]: unknown
}

const ACTIVE_STATUSES = new Set(['READY', 'LIVE', 'TEST'])

export function transformSupplier(raw: RawOrderfulRelationship): Supplier {
  const receiver = raw.receiver ?? {}
  const id = String(raw.id)
  const name =
    pickStr(receiver.organizationName) ??
    pickStr(receiver.ediAccountName) ??
    pickStr(receiver.liveIsaId) ??
    id

  return {
    id,
    externalId: id,
    name,
    isActive: ACTIVE_STATUSES.has((raw.status ?? '').toUpperCase()),
    platform: 'orderful',
    metadata: strMap({
      status: raw.status,
      autoSend: raw.autoSend,
      transactionType: raw.transactionType?.name,
      receiverEdiAccountId: receiver.ediAccountId,
      receiverLiveIsaId: receiver.liveIsaId,
      senderOrganizationName: raw.sender?.organizationName,
    }),
    raw,
  }
}
