/**
 * ContractWorks (Contracting.Works) adapter.
 *
 * Contracting.Works is an Azure-hosted contracting and field-service platform
 * (contracting.works). The docsign vertical maps onto Assignments, which are
 * the closest entity to a contract envelope: an Assignment tracks a billable
 * work agreement, associated contacts (signers), attached files (documents),
 * and lifecycle state.
 *
 * Auth: bearer token + tenant ID (clientId). ContractWorks has no OAuth2
 * authorization-code flow. Credentials are collected via the Connect Link form.
 *
 * API: REST writes at https://<host>/client/<clientId>/<Entity>/Upsert;
 *      GraphQL reads at https://<graphql-host>/client/<clientId>/graphql.
 *      Test host: contracting-extest-clientapi.azurewebsites.net
 *
 * Webhooks: x-hub-signature-256 with sha256= prefix + HMAC-SHA256.
 * Payload: { Header: { WebhookId, ClientId, Alg }, Data: [...] }
 */
import { customForm } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { DocsignAdapter } from '../../adapter/interface'
import type { Envelope } from '../../schema/envelope'
import type { Signer } from '../../schema/signer'
import type { Document } from '../../schema/document'
import type { AuditTrailEntry } from '../../schema/audit-trail-entry'
import type { Template } from '../../schema/template'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as contractworksExchange,
  refreshCredentials as contractworksRefresh,
} from './auth'
import { ContractworksClient } from './client'
import { verifyContractworksWebhook, parseContractworksWebhookEvents } from './webhook'

// ── Connect Link form (bearer token + tenant ID) ──────────────────────────────

const CW_CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'tenantId',
      label: 'Tenant ID (Client ID)',
      type: 'text',
      placeholder: 'b-dummydata',
      helpText:
        'The Contracting.Works client/tenant identifier. Found in the URL when logged in: /client/<tenantId>/.',
      required: true,
    },
    {
      name: 'accessToken',
      label: 'Bearer token',
      type: 'password',
      helpText:
        'A valid bearer token. Obtain one via the Contracting.Works Swagger UI by logging in and inspecting the Authorization header.',
      required: true,
    },
  ],
  exchange: async (fields: Record<string, string>): Promise<Credentials> => {
    const tenantId = (fields['tenantId'] ?? '').trim()
    const accessToken = (fields['accessToken'] ?? '').trim()
    if (!tenantId) throw new Error('Tenant ID is required.')
    if (!accessToken) throw new Error('Bearer token is required.')
    return { accessToken, extra: { tenantId } }
  },
})

// ── Adapter ───────────────────────────────────────────────────────────────────

export interface ContractworksAdapterConfig {
  /** Tenant (client) ID — embedded in every API URL. */
  tenantId?: string
  scopes?: string[]
}

/**
 * Why every read refuses. ContractWorks (contractworks.com) links no developer
 * or API documentation, and developer.contractworks.com / api.contractworks.com
 * redirect to its marketing home page. The docs URL this adapter carries,
 * https://github.com/ContractingWorks/ClientAPI, is "Documentation and examples
 * for using the Contracting.Works client API" — a contracting/field-service
 * system whose GraphQL schema (Examples/ReadAndWrite/schema.graphql) has no
 * signature, signer or envelope type, and lacks every field the old queries
 * selected (Assignment.name/status/documents/history, Contact.signedAt,
 * ServiceAgreement.id/name).
 */
const UNREADABLE_REASON =
  'ContractWorks publishes no API documentation, and the linked https://github.com/ContractingWorks/ClientAPI ' +
  'is "Documentation and examples for using the Contracting.Works client API", a different vendor with no signing entities'

function notSupported(what: 'list' | 'get', resource: string): Error {
  return Object.assign(
    new Error(`ContractWorks cannot ${what} ${resource}: ${UNREADABLE_REASON}`),
    {
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    },
  )
}

export class ContractworksAdapter implements DocsignAdapter {
  readonly platform = 'contractworks'
  readonly version = '0.1.0'

  // Connect Link — bearer-token form (no OAuth2).
  credentialFields = CW_CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CW_CREDENTIAL_FORM.exchangeCredentials

  getAuthUrl(state: string, _overrideScopes?: string[]): string {
    return buildAuthUrl('', '', [], state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return contractworksExchange(code, redirectUri, '', '')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return contractworksRefresh(credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyContractworksWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseContractworksWebhookEvents(payload)
  }

  private client(credentials: Credentials): ContractworksClient {
    return new ContractworksClient(credentials)
  }

  // ── Reads: refused ───────────────────────────────────────────────────────
  //
  // ContractWorks documents no public API, and the GraphQL service these
  // methods used to query is Contracting.Works', a different vendor whose
  // schema has no signing entities (see UNREADABLE_REASON). Each read refuses
  // before any request is built.

  async listEnvelopes(_credentials: Credentials, _params: QueryParams): Promise<Envelope[]> {
    throw notSupported('list', 'envelopes')
  }

  async getEnvelope(_credentials: Credentials, _id: string): Promise<Envelope> {
    throw notSupported('get', 'envelopes')
  }

  // Write methods are out of scope for the read rebuild and left as they were.
  async voidEnvelope(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Envelope> {
    await this.client(credentials).post('/Assignment/Upsert', [
      {
        assignmentId: id,
        enum_StatusId: 4, // cancelled/voided status
        note: data?.reason ?? 'Voided via API',
      },
    ])
    return this.getEnvelope(credentials, id)
  }

  async listSigners(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<Signer[]> {
    throw notSupported('list', 'signers')
  }

  async getSigner(_credentials: Credentials, _id: string): Promise<Signer> {
    throw notSupported('get', 'signers')
  }

  async listDocuments(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<Document[]> {
    throw notSupported('list', 'documents')
  }

  async getDocument(_credentials: Credentials, _id: string): Promise<Document> {
    throw notSupported('get', 'documents')
  }

  async listAuditTrailEntries(
    _credentials: Credentials,
    _envelopeId: string,
    _params: QueryParams,
  ): Promise<AuditTrailEntry[]> {
    throw notSupported('list', 'audit trail entries')
  }

  async getAuditTrailEntry(_credentials: Credentials, _id: string): Promise<AuditTrailEntry> {
    throw notSupported('get', 'audit trail entries')
  }

  async listTemplates(_credentials: Credentials, _params: QueryParams): Promise<Template[]> {
    throw notSupported('list', 'templates')
  }

  async getTemplate(_credentials: Credentials, _id: string): Promise<Template> {
    throw notSupported('get', 'templates')
  }
}
