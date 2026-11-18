/**
 * Movidesk (Zenvia Service) action → canonical Message.
 *
 * Movidesk calls a ticket's messages "actions" and serves them only on the
 * ticket record (`ticket.actions[n]`), per
 * https://atendimento.movidesk.com/kb/article/256/movidesk-ticket-api:
 *
 *   id          int       "Id (Número da ação) (Somente leitura)"
 *   type        int       "Tipo da ação: 1 = Interna 2 = Pública"
 *   origin      int       "Origem da ação (Somente leitura)"
 *   description string    "Em operações de leitura, esse campo é somente texto"
 *   status, justification  string (Somente leitura)
 *   createdDate datetime UTC  "Data de criação da ação. A data informada deve
 *                             estar no formato UTC" (served without a zone,
 *                             e.g. "2016-11-21T14:25:07.1920886")
 *   createdBy   person    "Dados do gerador da ação. *Obrigatório somente se
 *                          houver registro de apontamentos" — so it may be absent
 *   attachments attachments
 *
 * person.profileType: "Agente = 1, Cliente = 2, Agente e Cliente = 3".
 */
import type { Message, MessageType, AuthorType } from '../../../schema'
import { pickStr, strMap } from './shared'
import type { RawMovideskAction, RawMovideskPerson } from './ticket'

export type { RawMovideskAction }

/** A documented `datetime UTC` value; one served without a zone is UTC, not host-local. */
export function utcIso(value: string): string | undefined {
  const zoned = /(Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`
  const d = new Date(zoned)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

function messageType(type: number | null | undefined): MessageType {
  if (type === 1) return 'internal'
  if (type === 2) return 'public'
  return 'unknown'
}

// The reference never says who generated an action without createdBy, so it is
// 'unknown', not 'system'.
function authorType(author: RawMovideskPerson | null | undefined): AuthorType {
  if (!author) return 'unknown'
  if (author.profileType === 1 || author.profileType === 3) return 'user'
  if (author.profileType === 2) return 'contact'
  return 'unknown'
}

export function transformMessage(raw: RawMovideskAction, ticketId: string): Message {
  if (raw.id == null) throw new Error(`Movidesk action on ticket ${ticketId} has no id`)
  const createdAt = raw.createdDate ? utcIso(raw.createdDate) : undefined
  if (!createdAt) {
    throw new Error(`Movidesk action ${raw.id} on ticket ${ticketId} has no readable createdDate`)
  }

  return {
    // Action ids are numbered per ticket ("Id (Número da ação)"; the reference
    // addresses one as `&id=1&actionId=1`), so action 1 exists on every ticket:
    // the canonical id carries the ticket, externalId keeps the action number.
    id: `${ticketId}:${raw.id}`,
    externalId: String(raw.id),
    ticketId,
    // createdBy is optional upstream; with none there is no author id, and the
    // vertical's reference (zendesk) leaves a missing author id empty.
    authorId: raw.createdBy ? (pickStr(raw.createdBy.id) ?? '') : '',
    authorType: authorType(raw.createdBy),
    body: raw.description ?? '',
    type: messageType(raw.type),
    attachmentCount: raw.attachments?.length,
    createdAt,
    platform: 'movidesk',
    metadata: strMap({
      actionType: raw.type,
      origin: raw.origin,
      status: raw.status,
      justification: raw.justification,
    }),
    raw,
  }
}
