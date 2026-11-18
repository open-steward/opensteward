/**
 * Swisscom Trust Services — All-in Signing Service (AIS) adapter.
 *
 * AIS is an OASIS-DSS remote-signing service: documents never leave the
 * customer estate (only their hash is transferred), and signing runs as an
 * asynchronous transaction (a `signRequest` returns a `ResponseID`, then the
 * client polls `/pending` until the result flips from Pending to Success).
 *
 * Mapping to the canonical docsign schema:
 *   - Envelope          ← a signing transaction, addressed by its ResponseID.
 *   - Signer            ← the Claimed Identity / Mobile-ID step-up signer.
 *   - Document          ← the signed-document references (metadata only).
 *   - AuditTrailEntry   ← synthesised from the transaction outcome.
 *
 * AIS has NO list endpoint, NO void/cancel endpoint, NO templates, and NO
 * webhooks (it is poll-based). Those interface methods are intentionally left
 * unimplemented — the router returns 501 Not Implemented for each.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: template — Swisscom AIS exposes only /sign and /pending
 *   endpoints; there is no template management concept. "Templating" in
 *   AIS refers solely to auto-populating the DN field within a sign
 *   request body, not a listable/gettable template resource.
 *
 * Auth is OAuth2 client-credentials (bearer token); the Connect-Link form and
 * exchange come from the shared `oauth2ClientCredentials` template.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'

import {
  SWISSCOM_TRUST_SERVICES_CREDENTIAL_FORM,
  refreshCredentials as swisscomRefresh,
} from './auth'
import { SwisscomTrustServicesClient } from './client'
import { AIS_PROFILE, RESULT_MAJOR_SUCCESS, RESULT_MINOR_STEPUP_CANCEL } from './constants'

import { transformEnvelope, type RawSwisscomSignResponse } from './transform/envelope'
import { transformSigner } from './transform/signer'
import {
  transformDocument,
  type RawSwisscomSignatureObject,
} from './transform/document'
import {
  transformAuditTrailEntry,
  type SyntheticAuditEvent,
} from './transform/audit-trail-entry'

export class SwisscomTrustServicesAdapter implements DocsignAdapter {
  readonly platform = 'swisscom-trust-services'
  readonly version = '0.1.0'

  // Connect Link support — OAuth2 client-credentials form (no redirect flow).
  credentialFields = SWISSCOM_TRUST_SERVICES_CREDENTIAL_FORM.credentialFields
  exchangeCredentials = SWISSCOM_TRUST_SERVICES_CREDENTIAL_FORM.exchangeCredentials

  /**
   * AIS has no interactive authorization-code flow. The Connect Link credential
   * form (above) drives onboarding; these two methods exist only to satisfy the
   * BaseAdapter contract and are never reached for this auth model.
   */
  getAuthUrl(): string {
    throw new Error(
      'Swisscom Trust Services uses OAuth2 client-credentials; there is no authorization URL. Use the Connect Link credential form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error(
      'Swisscom Trust Services uses OAuth2 client-credentials; use exchangeCredentials, not exchangeCode.',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return swisscomRefresh(credentials)
  }

  private client(credentials: Credentials): SwisscomTrustServicesClient {
    return new SwisscomTrustServicesClient(credentials)
  }

  /**
   * Poll a transaction by its ResponseID. The AIS PendingRequest needs the
   * Claimed Identity (carried on `credentials.extra`) to authorize the poll.
   */
  private async pollTransaction(
    credentials: Credentials,
    responseId: string,
  ): Promise<RawSwisscomSignResponse> {
    const claimedIdentity = String(credentials.extra?.['claimedIdentity'] ?? '')
    const res = await this.client(credentials).pending<{ SignResponse?: RawSwisscomSignResponse }>({
      'async.PendingRequest': {
        '@Profile': AIS_PROFILE,
        OptionalInputs: {
          ClaimedIdentity: { Name: claimedIdentity },
          'async.ResponseID': responseId,
        },
      },
    })
    const signResponse = res.SignResponse
    if (!signResponse) throw new Error(`AIS transaction ${responseId} not found`)
    // Attach adapter-side context the transforms need but AIS does not echo.
    signResponse.claimedIdentity = claimedIdentity || undefined
    signResponse.requestedAt = new Date().toISOString()
    return signResponse
  }

  // ── Envelopes (signing transactions) ───────────────────────────────────────
  // No listEnvelopes / voidEnvelope: AIS has no list or cancel endpoint → 501.

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.pollTransaction(credentials, id)
    return transformEnvelope(raw)
  }

  // ── Signers (the Claimed Identity / step-up signer) ────────────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    const raw = await this.pollTransaction(credentials, envelopeId)
    return [transformSigner(raw, envelopeId)]
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, externalId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId) {
      throw new Error('getSigner expects an id of shape "<responseId>:<keyEntity>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === externalId) ?? all[0]
    if (!found) throw new Error(`Signer ${id} not found`)
    return found
  }

  // ── Documents (signed-hash references — metadata only) ─────────────────────

  async listDocuments(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    const raw = await this.pollTransaction(credentials, envelopeId)
    const objs =
      raw.SignatureObject?.Other?.['sc.SignatureObjects']?.['sc.ExtendedSignatureObject'] ?? []
    return objs.map((o, i) =>
      transformDocument(o as RawSwisscomSignatureObject, envelopeId, i),
    )
  }

  async getDocument(credentials: Credentials, id: string): Promise<Document> {
    const [envelopeId, whichDocument] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId) {
      throw new Error('getDocument expects an id of shape "<responseId>:<whichDocument>"')
    }
    const all = await this.listDocuments(credentials, envelopeId, {})
    const found = all.find((d) => d.externalId === whichDocument)
    if (!found) throw new Error(`Document ${id} not found`)
    return found
  }

  // ── Audit-trail entries — synthesised from the transaction outcome ─────────

  async listAuditTrailEntries(
    credentials: Credentials,
    envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    const raw = await this.pollTransaction(credentials, envelopeId)
    const occurredAt = raw.requestedAt ?? new Date().toISOString()
    const major = raw.Result?.ResultMajor ?? ''
    const minor = raw.Result?.ResultMinor ?? ''
    const events: SyntheticAuditEvent[] = [
      {
        envelopeId,
        occurredAt,
        eventType: 'created',
        description: 'AIS signing transaction created',
        extra: { claimedIdentity: raw.claimedIdentity, profile: raw['@Profile'] },
      },
      {
        envelopeId,
        occurredAt,
        eventType: 'sent',
        description: 'Step-up authorization requested',
        extra: {
          consentUrl:
            raw.OptionalOutputs?.['sc.StepUpAuthorisationInfo']?.['sc.Result']?.['sc.ConsentURL'] ??
            raw.OptionalOutputs?.['sc.StepUpAuthorisationInfo']?.['sc.ConsentURL'],
        },
      },
    ]
    if (major === RESULT_MAJOR_SUCCESS) {
      events.push({
        envelopeId,
        occurredAt,
        eventType: 'signed',
        description: 'Signature created',
        extra: { apTransactionId: raw.OptionalOutputs?.['sc.APTransID'] },
      })
      events.push({
        envelopeId,
        occurredAt,
        eventType: 'completed',
        description: 'Signing transaction completed',
      })
    } else if (minor === RESULT_MINOR_STEPUP_CANCEL) {
      events.push({
        envelopeId,
        occurredAt,
        eventType: 'declined',
        description: 'Signer cancelled the step-up authorization',
        extra: { resultMinor: minor },
      })
    } else if (major) {
      events.push({
        envelopeId,
        occurredAt,
        eventType: 'other',
        description: 'Signing transaction ended with an error',
        extra: { resultMajor: major, resultMinor: minor },
      })
    }
    return events.map((e, i) => transformAuditTrailEntry(e, i))
  }

  async getAuditTrailEntry(credentials: Credentials, id: string): Promise<AuditTrailEntry> {
    const [envelopeId, indexStr] = id.split(':')
    if (!envelopeId || indexStr === undefined) {
      throw new Error('getAuditTrailEntry expects an id of shape "<responseId>:<index>"')
    }
    const all = await this.listAuditTrailEntries(credentials, envelopeId, {})
    const found = all[Number(indexStr)]
    if (!found) throw new Error(`Audit entry ${id} not found`)
    return found
  }
}
