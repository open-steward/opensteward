/**
 * Anvil (useanvil.com) docsign adapter.
 *
 * Maps Anvil's GraphQL resources onto the canonical docsign schema:
 *   - `EtchPacket`            → Envelope
 *   - packet `documentGroup.signers` → Signer
 *   - packet `documentGroup.files`   → Document (metadata only, no content)
 *   - synthesised packet/signer timestamps → AuditTrailEntry
 *   - `Cast` (PDF template)   → Template
 *
 * Anvil authenticates with a single per-organization API key over HTTP Basic
 * (collected via the Connect Link `simpleApiKey` form). It is GraphQL-only;
 * lists page through `organization.etchPackets`. Anvil documents no webhook
 * signature verification (only a static shared token), so this adapter does
 * not expose `verifyWebhook` / `parseWebhookEvents`.
 *
 * Docs: https://www.useanvil.com/docs/api/graphql/
 */

import { simpleApiKey } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'

import { buildAuthUrl, exchangeCode as anvilExchange, refreshCredentials as anvilRefresh } from './auth'
import { AnvilClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformEnvelope,
  type RawAnvilEtchPacket,
  type RawAnvilSigner,
  type RawAnvilFile,
} from './transform/envelope'
import { transformSigner } from './transform/signer'
import { transformDocument } from './transform/document'
import {
  transformAuditTrailEntry,
  type SyntheticAuditEvent,
} from './transform/audit-trail-entry'
import { transformTemplate, type RawAnvilCast } from './transform/template'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'Anvil API key',
  helpText: 'Find this under Organization Settings → API keys in your Anvil dashboard.',
})

// ── GraphQL documents ────────────────────────────────────────────────────────

const PACKET_FIELDS = `
  eid
  name
  status
  isTest
  detailsURL
  webhookURL
  numberRemainingSigners
  createdAt
  updatedAt
  archivedAt
  completedAt
  sentAt
  embeddedAt
  documentGroup {
    eid
    status
    files
    signers {
      eid
      aliasId
      name
      email
      status
      routingOrder
      signActionType
      signerType
      signatureExperience
      provider
      completedAt
      createdAt
      updatedAt
    }
  }
`

const CAST_FIELDS = `
  eid
  name
  title
  allowedAliasIds
  publishedNumber
  versionNumber
  isTemplate
  archivedAt
  createdAt
  updatedAt
`

const CURRENT_USER_QUERY = `
  query CurrentUser {
    currentUser {
      eid
      organizations { eid slug name }
    }
  }
`

const LIST_PACKETS_QUERY = `
  query Organization($slug: String!, $page: Int, $limit: Int) {
    organization(organizationSlug: $slug) {
      eid
      etchPackets(page: $page, limit: $limit) {
        page
        pageCount
        rowCount
        items { ${PACKET_FIELDS} }
      }
    }
  }
`

const LIST_CASTS_QUERY = `
  query OrganizationCasts($slug: String!, $page: Int, $limit: Int) {
    organization(organizationSlug: $slug) {
      eid
      casts(page: $page, limit: $limit) {
        page
        pageCount
        rowCount
        items { ${CAST_FIELDS} }
      }
    }
  }
`

const GET_PACKET_QUERY = `
  query EtchPacket($eid: String!) {
    etchPacket(eid: $eid) { ${PACKET_FIELDS} }
  }
`

const GET_CAST_QUERY = `
  query Cast($eid: String!) {
    cast(eid: $eid) { ${CAST_FIELDS} }
  }
`

// ── Response shapes ─────────────────────────────────────────────────────────

interface CurrentUserResponse {
  currentUser?: {
    eid?: string
    organizations?: Array<{ eid?: string; slug?: string; name?: string }>
  }
}

interface EtchPacketPage {
  page?: number
  pageCount?: number
  rowCount?: number
  items?: RawAnvilEtchPacket[]
}

interface ListPacketsResponse {
  organization?: { eid?: string; etchPackets?: EtchPacketPage }
}

interface CastPage {
  page?: number
  pageCount?: number
  rowCount?: number
  items?: RawAnvilCast[]
}

interface ListCastsResponse {
  organization?: { eid?: string; casts?: CastPage }
}

interface GetPacketResponse {
  etchPacket?: RawAnvilEtchPacket
}

interface GetCastResponse {
  cast?: RawAnvilCast
}

export class AnvilAdapter implements DocsignAdapter {
  readonly platform = 'anvil'
  readonly version = '0.1.0'

  // Connect Link support — single API-key form (Anvil is not OAuth).
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return anvilExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return anvilRefresh(credentials)
  }

  private client(credentials: Credentials): AnvilClient {
    return new AnvilClient(credentials)
  }

  /** Resolve the caller's organization slug — required to scope list queries.
   *  Cached on `credentials.extra.organizationSlug` when available. */
  private async resolveOrgSlug(credentials: Credentials): Promise<string> {
    const cached = credentials.extra?.['organizationSlug']
    if (typeof cached === 'string' && cached) return cached
    const res = await this.client(credentials).query<CurrentUserResponse>(CURRENT_USER_QUERY)
    const org = res.currentUser?.organizations?.[0]
    if (!org?.slug) throw new Error('Anvil: could not resolve an organization slug for this API key')
    return org.slug
  }

  // ── Envelopes (etch packets) ──────────────────────────────────────────────

  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const slug = await this.resolveOrgSlug(credentials)
    const res = await this.client(credentials).query<ListPacketsResponse>(LIST_PACKETS_QUERY, {
      slug,
      page: params.page ?? 1,
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return (res.organization?.etchPackets?.items ?? []).map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const res = await this.client(credentials).query<GetPacketResponse>(GET_PACKET_QUERY, { eid: id })
    if (!res.etchPacket) throw new Error(`Anvil etch packet ${id} not found`)
    return transformEnvelope(res.etchPacket)
  }

  // ── Signers (documentGroup.signers) ───────────────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    const res = await this.client(credentials).query<GetPacketResponse>(GET_PACKET_QUERY, {
      eid: envelopeId,
    })
    if (!res.etchPacket) throw new Error(`Anvil etch packet ${envelopeId} not found`)
    const signers = res.etchPacket.documentGroup?.signers ?? []
    return signers.map((s: RawAnvilSigner) => transformSigner(s, envelopeId))
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, signerEid] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !signerEid) {
      throw new Error('Anvil getSigner expects an id of shape "<envelopeId>:<signerEid>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === signerEid)
    if (!found) throw new Error(`Signer ${signerEid} not found on packet ${envelopeId}`)
    return found
  }

  // ── Documents (documentGroup.files — metadata only, content REFUSED) ──────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    const res = await this.client(credentials).query<GetPacketResponse>(GET_PACKET_QUERY, {
      eid: envelopeId,
    })
    if (!res.etchPacket) throw new Error(`Anvil etch packet ${envelopeId} not found`)
    const files = res.etchPacket.documentGroup?.files ?? []
    return files.map((f: RawAnvilFile, i: number) => transformDocument(f, envelopeId, i))
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, fileEid] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !fileEid) {
      throw new Error('Anvil getDocument expects an id of shape "<envelopeId>:<fileEid>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === fileEid)
    if (!found) throw new Error(`Document ${fileEid} not found on packet ${envelopeId}`)
    return found
  }

  // ── Audit-trail entries — synthesised from packet/signer timestamps ───────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const res = await this.client(credentials).query<GetPacketResponse>(GET_PACKET_QUERY, {
      eid: envelopeId,
    })
    const packet = res.etchPacket
    if (!packet) throw new Error(`Anvil etch packet ${envelopeId} not found`)

    const events: SyntheticAuditEvent[] = []
    if (packet.createdAt) {
      events.push({
        envelopeId,
        occurredAt: packet.createdAt,
        type: 'created',
        description: 'Etch packet created',
      })
    }
    if (packet.sentAt) {
      events.push({
        envelopeId,
        occurredAt: packet.sentAt,
        type: 'sent',
        description: 'Etch packet sent to signers',
      })
    }
    for (const sig of packet.documentGroup?.signers ?? []) {
      if (String(sig.status ?? '').toLowerCase() === 'viewed') {
        events.push({
          envelopeId,
          occurredAt: sig.updatedAt,
          type: 'viewed',
          signerEid: sig.eid,
          signerEmail: sig.email,
          signerName: sig.name,
          description: 'Signer viewed the documents',
        })
      }
      if (sig.completedAt) {
        events.push({
          envelopeId,
          occurredAt: sig.completedAt,
          type: 'signed',
          signerEid: sig.eid,
          signerEmail: sig.email,
          signerName: sig.name,
          description: 'Signer completed signing',
        })
      }
    }
    if (packet.completedAt) {
      events.push({
        envelopeId,
        occurredAt: packet.completedAt,
        type: 'completed',
        description: 'All signers completed; packet finalized',
      })
    }
    events.sort(
      (a, b) =>
        new Date(a.occurredAt ?? 0).getTime() - new Date(b.occurredAt ?? 0).getTime(),
    )
    return events.map((e, i) => transformAuditTrailEntry(e, i))
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || indexStr === undefined) {
      throw new Error('Anvil getAuditTrailEntry expects an id of shape "<envelopeId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }

  // ── Templates (casts) ──────────────────────────────────────────────────────

  async listTemplates(credentials: Credentials, params: QueryParams): Promise<Template[]> {
    const slug = await this.resolveOrgSlug(credentials)
    const res = await this.client(credentials).query<ListCastsResponse>(LIST_CASTS_QUERY, {
      slug,
      page: params.page ?? 1,
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    })
    return (res.organization?.casts?.items ?? []).map(transformTemplate)
  }

  async getTemplate(credentials: Credentials, id: string): Promise<Template> {
    const res = await this.client(credentials).query<GetCastResponse>(GET_CAST_QUERY, { eid: id })
    if (!res.cast) throw new Error(`Anvil cast ${id} not found`)
    return transformTemplate(res.cast)
  }
}
