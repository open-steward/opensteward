import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIsoDatetime } from './shared'

/**
 * Anvil `EtchPacket` — a signature packet. Its signers and the completed-file
 * manifest hang off the nested `documentGroup`. A packet moves through
 * `draft → sent → partial → completed`.
 *
 * Docs: https://www.useanvil.com/docs/api/e-signatures/
 */
export interface RawAnvilSigner {
  eid: string
  aliasId?: string
  name?: string
  email?: string
  status?: string
  routingOrder?: number
  signActionType?: string
  signerType?: string
  signatureExperience?: string
  provider?: string
  completedAt?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export interface RawAnvilFile {
  eid?: string
  id?: string
  name?: string
  filename?: string
  title?: string
  type?: string
  [key: string]: unknown
}

export interface RawAnvilDocumentGroup {
  eid?: string
  status?: string
  signers?: RawAnvilSigner[]
  files?: RawAnvilFile[]
  [key: string]: unknown
}

export interface RawAnvilEtchPacket {
  eid: string
  name?: string
  status?: string
  isTest?: boolean
  detailsURL?: string
  webhookURL?: string
  numberRemainingSigners?: number
  documentGroup?: RawAnvilDocumentGroup
  createdAt?: string
  updatedAt?: string
  archivedAt?: string
  completedAt?: string
  sentAt?: string
  embeddedAt?: string
  [key: string]: unknown
}

/** Stable per-file id within a packet — Anvil files key off `eid`. */
export function anvilFileId(f: RawAnvilFile, index: number): string {
  return pickStr(f.eid) ?? pickStr(f.id) ?? String(index)
}

function mapStatus(raw: string | undefined): EnvelopeStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'draft':
      return 'draft'
    case 'sent':
    case 'partial':
      return 'sent'
    case 'completed':
      return 'completed'
    case 'archived':
      return 'voided'
    default:
      return 'draft'
  }
}

function signingOrder(signers: RawAnvilSigner[]): 'parallel' | 'sequential' {
  const orders = signers.map((s) => Number(s.routingOrder ?? 0))
  return new Set(orders).size > 1 ? 'sequential' : 'parallel'
}

export function transformEnvelope(raw: RawAnvilEtchPacket): Envelope {
  const signers = [...(raw.documentGroup?.signers ?? [])].sort(
    (a, b) => Number(a.routingOrder ?? 0) - Number(b.routingOrder ?? 0),
  )
  const files = raw.documentGroup?.files ?? []
  return {
    id: raw.eid,
    externalId: raw.eid,
    status: mapStatus(raw.status),
    subject: pickStr(raw.name) ?? '',
    signingOrder: signingOrder(signers),
    signerIds: signers.map((s) => s.eid),
    documentIds: files.map((f, i) => `${raw.eid}:${anvilFileId(f, i)}`),
    createdAt: toIsoDatetime(raw.createdAt),
    sentAt: toIsoDatetime(raw.sentAt),
    completedAt: toIsoDatetime(raw.completedAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    platform: 'anvil',
    metadata: strMap({
      isTest: raw.isTest,
      detailsURL: raw.detailsURL,
      numberRemainingSigners: raw.numberRemainingSigners,
      documentGroupEid: raw.documentGroup?.eid,
      archivedAt: raw.archivedAt,
      embeddedAt: raw.embeddedAt,
    }),
    raw,
  }
}
