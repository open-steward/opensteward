/**
 * Signzy Contract360 adapter — Indian digital-contracting + eSign gateway.
 *
 * Maps the Signzy Contract360 contract (POST /contract/pulldata) → canonical
 * `Envelope`, its `signerdetail[]` → `Signer`, and the per-signer
 * `notificationdetails[]` timeline → synthesised `AuditTrailEntry`.
 *
 * Authentication: a static access token (provisioned by your Signzy CSM) sent
 * in the `Authorization` header. There is no OAuth flow — call
 * `credentialFields()` + `exchangeCredentials()` (Connect Link). The customer
 * picks production vs pre-production; the host is stored on
 * `credentials.extra.baseUrl`.
 *
 * Resources Signzy's REST surface supports here: envelopes (by id), signers,
 * and audit-trail entries. The following are intentionally NOT implemented and
 * return 501:
 *   - listEnvelopes / voidEnvelope — Signzy has no list-contracts or
 *     cancel/void REST endpoint; reads are strictly by `contractid`.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: document — Signzy Contract360 exposes document content only as
 *   signed-PDF URLs / base64 / hashes on the pull-contract response; there is
 *   no per-document metadata listing endpoint.
 * Unavailable: template — Signzy Contract360 has no read/list template
 *   endpoint; templates are uploaded out-of-band and referenced by id at
 *   contract creation only.
 *
 * Refused fields (never surfaced):
 *   - Document content (`initialcontract`, `finalsignedcontract`,
 *     `signersignedcontract`, `estampedfile`) and their hashes
 *   - Signer Aadhaar / DSC KYC payloads (`signerdscdata`, captured images)
 *
 * Webhooks: Signzy delivers outbound callbacks whose authenticity rests on a
 * caller-supplied `callbackurlauthorizationheader` (a static bearer the
 * integrator sets on the contract), not an inbound HMAC signature. With no
 * platform-side signature scheme to verify, the adapter exposes no webhook
 * verifier or parser.
 *
 * Docs: https://docs.signzy.com/contract360/pull-contract-api
 */

import type { Credentials, QueryParams, CredentialField } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'

import {
  buildAuthUrl,
  exchangeCode as signzyExchange,
  refreshCredentials as signzyRefresh,
  FORM,
} from './auth'
import { SignzyClient } from './client'
import { transformEnvelope, type RawSignzyContract } from './transform/envelope'
import { transformSigner } from './transform/signer'
import {
  transformAuditTrailEntry,
  mapNotificationEvent,
  type SyntheticAuditEvent,
} from './transform/audit-trail-entry'

export interface SignzyAdapterConfig {
  redirectUri?: string
}

export class SignzyAdapter implements DocsignAdapter {
  readonly platform = 'signzy'
  readonly version = '0.1.0'

  constructor(_config: SignzyAdapterConfig = {}) {
    // Signzy uses a static access token; no OAuth client config.
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return buildAuthUrl()
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return signzyExchange(code, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return signzyRefresh(credentials)
  }

  credentialFields(): CredentialField[] {
    return FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return FORM.exchangeCredentials(fields)
  }

  private client(credentials: Credentials): SignzyClient {
    return new SignzyClient(credentials)
  }

  /** POST /contract/pulldata — the single read endpoint, keyed by contractid. */
  private async pullContract(
    credentials: Credentials,
    contractId: string,
  ): Promise<RawSignzyContract> {
    const raw = await this.client(credentials).post<RawSignzyContract>('/contract/pulldata', {
      contractid: contractId,
    })
    if (!raw || !raw.contractid) {
      throw new Error(`Signzy contract ${contractId} not found`)
    }
    return raw
  }

  // ── Envelopes (contracts) ───────────────────────────────────────────────
  //
  // Signzy has no list-contracts endpoint, so listEnvelopes is not implemented
  // (router returns 501). Reads are strictly by contract id.

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.pullContract(credentials, id)
    return transformEnvelope(raw)
  }

  // ── Signers (signerdetail[] on the contract) ──────────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    const raw = await this.pullContract(credentials, envelopeId)
    return (raw.signerdetail ?? []).map((s) => transformSigner(s, envelopeId))
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, signerId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId || !signerId) {
      throw new Error('getSigner expects an id of shape "<contractId>:<signerId>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === signerId)
    if (!found) throw new Error(`Signer ${signerId} not found on contract ${envelopeId}`)
    return found
  }

  // ── Audit-trail entries — synthesised from per-signer notification timeline ─

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const raw = await this.pullContract(credentials, envelopeId)
    const events: SyntheticAuditEvent[] = []

    for (const signer of raw.signerdetail ?? []) {
      const signerId = signer.signerid
      const signerName = signer.signername
      const signerIp = signer.signerip

      for (const notification of signer.notificationdetails ?? []) {
        const eventType = mapNotificationEvent(notification.event)
        for (const txn of notification.transactiondetails ?? []) {
          for (const attempt of txn.attempts ?? []) {
            events.push({
              envelopeId,
              occurredAt:
                typeof attempt.timestamp === 'number'
                  ? String(attempt.timestamp)
                  : attempt.timestamp,
              type: eventType,
              description: attempt.description ?? notification.event ?? 'Signzy notification',
              signerId,
              signerName,
              signerIp,
              channel: txn.channel,
              event: notification.event,
              status: attempt.status,
              vendorId: attempt.vendorid,
              notificationId: attempt.id,
            })
          }
        }
      }

      // A successful sign carries its own timestamp on the signer record.
      if ((signer.status ?? '').toLowerCase() === 'success' && signer.contractlastsigntime) {
        events.push({
          envelopeId,
          occurredAt:
            typeof signer.contractlastsigntime === 'number'
              ? String(signer.contractlastsigntime)
              : signer.contractlastsigntime,
          type: 'signed',
          description: 'Signer signed the contract',
          signerId,
          signerName,
          signerIp,
        })
      }
    }

    // Contract-level completion event.
    if (raw.iscompleted && raw.contractcompletiontime) {
      events.push({
        envelopeId,
        occurredAt:
          typeof raw.contractcompletiontime === 'number'
            ? String(raw.contractcompletiontime)
            : raw.contractcompletiontime,
        type: 'completed',
        description: 'Contract completed',
      })
    }

    events.sort((a, b) => {
      const ta = a.occurredAt ? Date.parse(a.occurredAt) : 0
      const tb = b.occurredAt ? Date.parse(b.occurredAt) : 0
      return (Number.isNaN(ta) ? 0 : ta) - (Number.isNaN(tb) ? 0 : tb)
    })

    return events.map((e, i) => transformAuditTrailEntry(e, i))
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || indexStr === undefined) {
      throw new Error('getAuditTrailEntry expects an id of shape "<contractId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }
}
