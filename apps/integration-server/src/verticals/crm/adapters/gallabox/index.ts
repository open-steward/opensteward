/**
 * Gallabox adapter for the CRM vertical.
 *
 * Gallabox is a WhatsApp-first customer engagement platform with CRM features
 * for managing contacts and conversations.
 *
 * Docs: https://developers.gallabox.com/
 *
 * ── Auth ─────────────────────────────────────────────────────────────────────
 *   API key + API secret passed as HTTP headers on every request.
 *   Account ID is required in every resource path.
 *
 *   credentials.accessToken    = API Key ID (from Settings > API Keys)
 *   credentials.extra.apiSecret  = API Secret
 *   credentials.extra.accountId  = Gallabox Account ID
 *
 * ── Coverage ─────────────────────────────────────────────────────────────────
 *
 * Implemented (2):
 *   Contacts: get, create
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   listContacts  — no list endpoint documented in Gallabox API
 *   updateContact — no update endpoint documented in Gallabox API
 *   deleteContact — no delete endpoint documented in Gallabox API
 *   Companies, Deals, Notes, Activities — not in Gallabox CRM API
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: pipeline — Gallabox is a WhatsApp-first messaging platform;
 *   its REST API exposes only Contacts, Conversations, Messages, Templates,
 *   Users, and Webhooks — no pipeline or deal-stage concept exists.
 */

import { customForm } from '@opensteward/shared'
import type { CrmAdapter, Credentials } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { WebhookEvent } from '../../schema/webhook'

import { GallaboxClient } from './client'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import {
  transformContact,
  untransformContact,
  type RawGallaboxContact,
} from './transform/contact'

const GALLABOX_FORM = customForm({
  fields: [
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'text',
      required: true,
      helpText: 'Found in Gallabox Settings > API Keys.',
    },
    {
      name: 'apiSecret',
      label: 'API Secret',
      type: 'password',
      required: true,
      helpText: 'Generated when you create an API Key. Store it securely — it is shown only once.',
    },
    {
      name: 'accountId',
      label: 'Account ID',
      type: 'text',
      required: true,
      helpText: 'Your Gallabox account identifier, visible in the dashboard URL.',
    },
  ],
  exchange: async (fields) => {
    const apiKey = (fields['apiKey'] ?? '').trim()
    const apiSecret = (fields['apiSecret'] ?? '').trim()
    const accountId = (fields['accountId'] ?? '').trim()
    if (!apiKey) throw new Error('API Key is required.')
    if (!apiSecret) throw new Error('API Secret is required.')
    if (!accountId) throw new Error('Account ID is required.')
    return {
      accessToken: apiKey,
      extra: { apiSecret, accountId },
    }
  },
})

export class GallaboxAdapter implements CrmAdapter {
  readonly platform = 'gallabox'
  readonly version = '0.1.0'

  // Connect Link support — two-field API key/secret form.
  credentialFields = GALLABOX_FORM.credentialFields
  exchangeCredentials = GALLABOX_FORM.exchangeCredentials

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Gallabox uses API key + secret, not OAuth2.
    return ''
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Gallabox: use exchangeCredentials (customForm), not exchangeCode.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static API keys do not expire — return as-is.
    return credentials
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return _verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return _parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): GallaboxClient {
    return new GallaboxClient(credentials)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────
  // Gallabox documents only GET (single) and POST (create) for contacts.
  // listContacts, updateContact, deleteContact are not part of the public API.

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const c = this.client(credentials)
    const raw = await c.get<RawGallaboxContact>(
      `/accounts/${c.accountId}/contacts/${id}`,
    )
    if (!raw || !raw.id) {
      throw Object.assign(
        new Error(`Gallabox: contact ${id} not found`),
        { statusCode: 404 },
      )
    }
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const c = this.client(credentials)
    const body = untransformContact(data)
    const raw = await c.post<RawGallaboxContact>(
      `/accounts/${c.accountId}/contacts`,
      body,
    )
    if (!raw || !raw.id) {
      throw new Error('Gallabox: contact creation returned no data')
    }
    return transformContact(raw)
  }
}
