/**
 * Transform a CellPoint Digital (Velocity) transaction into a canonical Charge.
 *
 * Source: the `<transaction>` element of a get-transaction-status response.
 * Velocity splits the timestamp into `<createdDate>` (YYYY-MM-DD) and
 * `<createdTime>` (HH:MM:SS); we recombine them and normalise via
 * `toIsoDatetime`. Amounts are already in the smallest currency unit (minor
 * units), matching the canonical schema. The transaction status carries a
 * numeric `status` id plus a `status-message`; we map the numeric code to a
 * canonical `ChargeStatus`.
 *
 * Docs: https://documentation.cellpointdigital.com/docs/get-transaction-status-response
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import {
  parseXml,
  child,
  text,
  attr,
  toInt,
  pickCurrency,
  strMap,
  type XmlNode,
} from './shared'
import { STATUS_CODES } from '../constants'

/** Map a Velocity transaction status id to a canonical ChargeStatus. */
function mapStatus(statusId: number | undefined): ChargeStatus {
  switch (statusId) {
    case STATUS_CODES.operationSuccess: // 1000 — captured / completed
    case STATUS_CODES.authorized: // 2000 — authorized by PSP
    case STATUS_CODES.sessionComplete: // 4030 — session complete
      return 'succeeded'
    default:
      return 'pending'
  }
}

/** Recombine Velocity's split date + time fields into an ISO-8601 timestamp. */
function combineDateTime(date: string | undefined, time: string | undefined): string | undefined {
  if (!date) return undefined
  return toIsoDatetime(time ? `${date} ${time}` : date)
}

/**
 * Transform a parsed `<transaction>` node. Accepts either the raw XML string
 * (a full get-transaction-status response) or an already-parsed transaction
 * node, so callers and tests can drive it either way.
 */
export function transformCharge(input: XmlNode | string): Charge {
  const tx = resolveTransaction(input)

  const amountNode = child(tx, 'amount')
  const statusNode = child(tx, 'status')
  const statusMsgNode = child(statusNode, 'status-message')
  // The numeric status code may sit on the <status> id attribute, the
  // <status-message> id attribute, or as the text of <status>.
  const statusId =
    toInt(attr(statusNode, 'id')) ??
    toInt(attr(statusMsgNode, 'id')) ??
    toInt(text(statusNode))
  const statusMessage = text(statusMsgNode) ?? text(statusNode)

  const id = text(tx, 'id') ?? ''
  const orderNo = text(tx, 'order-no')

  return {
    id,
    externalId: id,
    amount: toInt(text(amountNode)) ?? 0,
    currency: pickCurrency(attr(amountNode, 'currency')),
    status: mapStatus(statusId),
    customerId: text(child(tx, 'client-info'), 'profileid'),
    receiptEmail: text(child(tx, 'client-info'), 'email'),
    failureMessage: undefined,
    gateway: 'cellpoint-digital',
    metadata: strMap({
      'order-no': orderNo,
      'session-id': text(tx, 'session-id'),
      'approval-code': text(tx, 'approval-code'),
      'psp-id': text(tx, 'psp-id'),
      'psp-name': text(tx, 'psp-name'),
      'payment-method-id': text(tx, 'payment-method-id'),
      'card-mask': text(tx, 'card-mask'),
      'card-name': text(tx, 'card-name'),
      'status-message': statusMessage,
    }),
    createdAt: combineDateTime(text(tx, 'createdDate'), text(tx, 'createdTime')),
    updatedAt: undefined,
    raw: tx,
  }
}

function resolveTransaction(input: XmlNode | string): XmlNode {
  const root = typeof input === 'string' ? parseXml(input) : input
  // A get-transaction-status response wraps <transaction> under the operation
  // element (e.g. <get-transaction-status>) and optionally a <session>. Search
  // the tree for the first <transaction> node; fall back to the input itself.
  return findFirst(root, 'transaction') ?? input as XmlNode
}

/** Depth-first search for the first descendant element with the given tag. */
function findFirst(node: XmlNode | undefined, tag: string): XmlNode | undefined {
  if (!node || typeof node !== 'object') return undefined
  const direct = child(node, tag)
  if (direct) return direct
  for (const [key, value] of Object.entries(node)) {
    if (key === '$attr' || key === '$text') continue
    const candidates = Array.isArray(value) ? value : [value]
    for (const c of candidates) {
      if (c && typeof c === 'object' && !Array.isArray(c)) {
        const found = findFirst(c as XmlNode, tag)
        if (found) return found
      }
    }
  }
  return undefined
}
