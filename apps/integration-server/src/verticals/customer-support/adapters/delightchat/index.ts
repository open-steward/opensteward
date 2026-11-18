/**
 * DelightChat adapter — customer-support vertical.
 *
 * DelightChat is an omnichannel support & WhatsApp marketing platform for
 * e-commerce brands (WhatsApp, Instagram, Facebook, Email, Live Chat).
 *
 * Public API surface (as of 2025): a single POST endpoint for sending
 * WhatsApp messages via saved automations. There are no published read-only
 * REST endpoints for conversations, contacts, users, tags, teams, or macros.
 * All those resource methods are therefore intentionally absent; the unified
 * server will return 501 Not Implemented for them automatically.
 *
 * Auth: X-API-KEY header. No OAuth flow.
 * Docs: https://api.delightchat.io/docs
 */
import type { Credentials, CredentialField } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DelightchatAdapterConfig {
  // No OAuth client credentials required — API key only.
  // Reserved for future use if DelightChat adds OAuth support.
}

export class DelightchatAdapter implements CustomerSupportAdapter {
  readonly platform = 'delightchat'
  readonly version = '0.1.0'

   
  constructor(_config?: DelightchatAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return adapterCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return adapterExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('DelightChat uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire; pass through unchanged.
    return credentials
  }

  // ── Resource methods ────────────────────────────────────────────────────────
  //
  // DelightChat does not expose public read endpoints for tickets, messages,
  // contacts, users, tags, teams, or macros. Methods are intentionally absent
  // so the framework returns 501 Not Implemented. If DelightChat adds read APIs
  // in the future, implement them here following the canonical patterns.
  //
  // ─────────────────────────────────────────────────────────────────────────────
}
