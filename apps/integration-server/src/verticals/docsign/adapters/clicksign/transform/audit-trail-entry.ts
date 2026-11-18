/**
 * Clicksign event → canonical AuditTrailEntry.
 *
 * Source: the `events` block of `GET /api/v1/documents/:key`
 * (https://developers.clicksign.com/v1.0/docs/visualizar-documento.md,
 * "Events: atributos dos eventos"). Its documented attributes are `name`
 * ("Nome do evento ocorrido"), `data` ("Dados contendo os detalhes do
 * evento") and `occurred_at` ("Data na qual o evento ocorreu"). Clicksign
 * gives an event no id, so the id is `<documentKey>:<occurred_at>:<name>`,
 * from documented fields only (the adapter suffixes exact duplicates).
 *
 * Event names are the list at
 * https://developers.clicksign.com/v1.0/docs/eventos.md. The actor is read
 * from the `data` shape each event's own page documents: `sign` and
 * `refusal` carry `data.signer` (evento-sign.md, evento-refusal.md);
 * `upload`, `add_signer`, `cancel` and `close` carry `data.user`
 * (evento-upload.md, visualizar-documento.md, evento-cancel.md,
 * evento-close.md). Other events carry no actor.
 */
import type { AuditTrailEntry, AuditTrailEventType } from '../../../schema/audit-trail-entry'
import { pickStr, toIso } from './shared'

interface RawClicksignActor {
  key?: string
  email?: string
  name?: string
  /** Signer only: "Endereço de IP público sobre o qual a assinatura foi realizada." */
  address?: string
  [key: string]: unknown
}

export interface RawClicksignEvent {
  name?: string
  data?: {
    user?: RawClicksignActor
    signer?: RawClicksignActor
    [key: string]: unknown
  } | null
  occurred_at?: string
  [key: string]: unknown
}

/** Documented event names (eventos.md) → canonical type. Unlisted → 'other'. */
const EVENT_TYPES: Record<string, AuditTrailEventType> = {
  // "Ocorre quando é realizado o upload de um documento."
  upload: 'created',
  // "Ocorre quando um signatário assina um documento."
  sign: 'signed',
  // "Ocorre quando um documento é recusado."
  refusal: 'declined',
  // "Ocorre quando um documento é cancelado manualmente."
  cancel: 'voided',
  // "Ocorre quando um documento é finalizado manualmente."
  close: 'completed',
  // "Ocorre quando um documento é finalizado automaticamente logo após a última assinatura."
  auto_close: 'completed',
  // "Ocorre quando a data limite de assinatura de um documento for atingida."
  deadline: 'expired',
}

const SIGNER_EVENTS = new Set(['sign', 'refusal'])
const USER_EVENTS = new Set(['upload', 'add_signer', 'cancel', 'close'])

function actorOf(raw: RawClicksignEvent, name: string): RawClicksignActor | undefined {
  if (SIGNER_EVENTS.has(name)) return raw.data?.signer
  if (USER_EVENTS.has(name)) return raw.data?.user
  return undefined
}

export function transformAuditTrailEntry(
  raw: RawClicksignEvent,
  envelopeId: string,
): AuditTrailEntry {
  const name = pickStr(raw.name)
  if (!name) throw new Error(`Clicksign event on document ${envelopeId} has no name`)
  const occurredAt = toIso(raw.occurred_at)
  if (!occurredAt) {
    throw new Error(`Clicksign ${name} event on document ${envelopeId} has no valid occurred_at`)
  }
  const actor = actorOf(raw, name)
  const id = `${envelopeId}:${occurredAt}:${name}`
  return {
    id,
    externalId: id,
    envelopeId,
    occurredAt,
    eventType: EVENT_TYPES[name] ?? 'other',
    description: name,
    actorId: pickStr(actor?.key),
    actorEmail: pickStr(actor?.email),
    actorName: pickStr(actor?.name),
    actorIp: name === 'sign' ? pickStr(actor?.address) : undefined,
    platform: 'clicksign',
    metadata: { name },
    raw,
  }
}
