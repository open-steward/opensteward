/**
 * Cryptomathic Signer adapter — Cloud Signature Consortium (CSC) API v2.
 *
 * Cryptomathic Signer is an eIDAS-certified Remote Signature Service Provider
 * (RSSP). It is NOT an envelope-workflow product (no e-mail invitations, no
 * recipient routing): it is a credential + hash-signing service that exposes
 * the standardised CSC API v2. The mapping to the canonical docsign schema is:
 *
 *   - Envelope ← a CSC signing *credential* (`credentialID`). The credential
 *                is the addressable unit; its key/cert lifecycle drives status.
 *   - Signer   ← the credential owner, derived from the certificate subject DN.
 *
 * Surface intentionally left unimplemented (the router returns 501):
 *   - voidEnvelope            — CSC has no credential-revocation API method.
 *   - listDocuments/getDocument — CSC is hash-based; documents never leave the
 *                                 client (only Base64 digests are signed), so
 *                                 there is no document resource to enumerate.
 *   - audit-trail entries     — CSC exposes no audit-log query method.
 *   - templates               — CSC has no template concept.
 *   - webhooks                — CSC signing is synchronous request/response;
 *                               there are no webhook deliveries.
 *
 * Auth is OAuth 2.0 client-credentials (`authType: "oauth2client"`); the
 * Connect-Link form + exchange come from the shared `oauth2ClientCredentials`
 * template. With the (non-user-specific) client-credentials grant the CSC
 * `userID` is NOT implicit, so it is collected on the form and passed to
 * `credentials/list`.
 */

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: audit-trail-entry — CSC API v2 defines no audit-log query method.
// Unavailable: document          — CSC is hash-based; no document repository or
//                                  enumeration endpoint exists in the spec.
// Unavailable: template          — CSC API v2 has no template concept.
// ──────────────────────────────────────────────────────────────────────────────

import { pageLocally, type Credentials, type QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'

import {
  CRYPTOMATHIC_SIGNER_CREDENTIAL_FORM,
  refreshCredentials as cryptomathicRefresh,
} from './auth'
import { CryptomathicSignerClient } from './client'

import { transformEnvelope, type RawCscCredentialInfo } from './transform/envelope'
import { transformSigner } from './transform/signer'

interface CredentialsListResponse {
  credentialIDs?: string[]
  credentialInfos?: RawCscCredentialInfo[]
  onlyValid?: boolean
}

export class CryptomathicSignerAdapter implements DocsignAdapter {
  readonly platform = 'cryptomathic-signer'
  readonly version = '0.1.0'

  // Connect Link support — OAuth2 client-credentials form (no redirect flow).
  credentialFields = CRYPTOMATHIC_SIGNER_CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CRYPTOMATHIC_SIGNER_CREDENTIAL_FORM.exchangeCredentials

  /**
   * CSC service authorization uses the OAuth2 client-credentials grant; there
   * is no interactive authorization-code flow. These two methods exist only to
   * satisfy the BaseAdapter contract and are never reached for this auth model.
   */
  getAuthUrl(): string {
    throw new Error(
      'Cryptomathic Signer uses OAuth2 client-credentials; there is no authorization URL. Use the Connect Link credential form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error(
      'Cryptomathic Signer uses OAuth2 client-credentials; use exchangeCredentials, not exchangeCode.',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return cryptomathicRefresh(credentials)
  }

  private client(credentials: Credentials): CryptomathicSignerClient {
    return new CryptomathicSignerClient(credentials)
  }

  /** Resolve full credential info for one credentialID via credentials/info. */
  private async credentialInfo(
    credentials: Credentials,
    credentialID: string,
  ): Promise<RawCscCredentialInfo> {
    const raw = await this.client(credentials).post<RawCscCredentialInfo>('/credentials/info', {
      credentialID,
      certificates: 'single',
      certInfo: true,
      authInfo: true,
    })
    return { ...raw, credentialID }
  }

  // ── Envelopes (CSC signing credentials) ────────────────────────────────────
  // No voidEnvelope: CSC has no credential-revocation method → 501.

  /**
   * CSC v2 `credentials/list` takes no paging parameter: its input table is
   * userID, credentialInfo, certificates, certInfo, authInfo, onlyValid, lang
   * and clientData, and it returns every credentialID for the user in one
   * reply (CSC API v2, section 11.4). `maxResults` / `pageToken` were CSC v1.
   * The whole collection is therefore in hand and is paged here; only the ids
   * on the requested page are resolved via credentials/info.
   */
  async listEnvelopes(credentials: Credentials, params: QueryParams): Promise<Envelope[]> {
    const userID = String(credentials.extra?.['userID'] ?? '').trim()
    const body: Record<string, unknown> = {
      credentialInfo: true,
      certificates: 'single',
      certInfo: true,
      authInfo: true,
    }
    // With oauth2client the userID is not implicit; pass it when configured.
    if (userID) body['userID'] = userID

    const res = await this.client(credentials).post<CredentialsListResponse>(
      '/credentials/list',
      body,
    )

    // If the RSSP returned full credentialInfos, transform them directly;
    // otherwise resolve each credentialID on the page via credentials/info.
    if (res.credentialInfos && res.credentialInfos.length > 0) {
      const all = res.credentialInfos.map((info, i) => ({
        ...info,
        credentialID: info.credentialID ?? res.credentialIDs?.[i],
      }))
      return pageLocally(all, params).map(transformEnvelope)
    }
    const ids = pageLocally(res.credentialIDs ?? [], params)
    const infos = await Promise.all(ids.map((id) => this.credentialInfo(credentials, id)))
    return infos.map(transformEnvelope)
  }

  async getEnvelope(credentials: Credentials, id: string): Promise<Envelope> {
    const raw = await this.credentialInfo(credentials, id)
    return transformEnvelope(raw)
  }

  // ── Signers (the credential owner — certificate subject) ───────────────────

  async listSigners(
    credentials: Credentials,
    envelopeId: string,
    params: QueryParams,
  ): Promise<Signer[]> {
    // credentials/info returns one credential, so one owner: that is the
    // whole collection, paged here so page 2 is empty rather than page 1 again.
    const raw = await this.credentialInfo(credentials, envelopeId)
    return pageLocally([transformSigner(raw, envelopeId)], params)
  }

  async getSigner(credentials: Credentials, id: string): Promise<Signer> {
    const [envelopeId, externalId] = id.includes(':') ? id.split(':') : [id, id]
    if (!envelopeId) {
      throw new Error('getSigner expects an id of shape "<credentialID>:<credentialID>"')
    }
    const all = await this.listSigners(credentials, envelopeId, {})
    const found = all.find((s) => s.externalId === externalId) ?? all[0]
    if (!found) throw new Error(`Signer ${id} not found`)
    return found
  }
}
