/**
 * Central registry of every encrypted-at-rest column across the codebase.
 *
 * Used by `rotate-store-secret` to know which (db, table, column) triples
 * need re-encryption when `STORE_SECRET` rotates. Adding a new encrypted
 * column anywhere means adding one entry here — otherwise the rotation
 * tool will silently skip those rows and they'll be unreadable after
 * rotation.
 *
 * Note: this file is the source of truth for salts; the runtime stores
 * also define their own `DEFAULT_SALT` constants, and the two MUST stay
 * in sync (a unit test asserts it).
 */

export interface EncryptedBlob {
  /** SQL table name. */
  table: string
  /** Column holding the base64 ciphertext. */
  column: string
  /**
   * Per-store salt used by `scryptSync` to derive the AES key from the
   * shared `STORE_SECRET`. Two stores can share the same secret without
   * sharing key material because their salts differ.
   */
  salt: string
}

/**
 * Encrypted columns that live in the `integration-server` storePath db
 * (default: `data/credentials.db`).
 */
export const INTEGRATION_SERVER_BLOBS: EncryptedBlob[] = [
  // CredentialStore — OAuth tokens. Default table/column; logistics
  // overrides the table name to `connections` but uses the same default
  // salt + 'data' column.
  { table: 'credentials', column: 'data', salt: 'opensteward-v1' },
  { table: 'connections', column: 'data', salt: 'opensteward-v1' },
  // AdapterSettingsStore — platform OAuth app credentials (client_id +
  // client_secret + redirect_uri + scopes).
  {
    table: 'adapter_settings',
    column: 'encrypted_config',
    salt: 'opensteward-adapter-settings-v1',
  },
  // EndUserStore — PII (names, phone, address, ID number).
  { table: 'end_users', column: 'pii_data', salt: 'opensteward-end-users-v1' },
  // WebhookSubscriptionStore — outbound-webhook signing secret.
  { table: 'webhook_subscriptions', column: 'secret_encrypted', salt: 'opensteward-webhooks-v1' },
  // WebhookSubscriptionStore — custom delivery headers, which carry the
  // receiver's credential (`Authorization`, `DD-API-KEY`). Nullable: most
  // subscriptions have none, and rotation skips NULL cells.
  { table: 'webhook_subscriptions', column: 'headers_encrypted', salt: 'opensteward-webhooks-v1' },
]

/**
 * Encrypted columns that live in the integration-server DATA-STORE db
 * (default: `data/resources.db`; the one Postgres db when `DATABASE_URL` is
 * set). Include that file in a rotation: `--db .../resources.db`.
 */
export const DATA_STORE_BLOBS: EncryptedBlob[] = [
  // DestinationStore (@opensteward/destinations) — warehouse/lake credentials
  // (S3 keys, GCS service-account JSON, Azure keys, Postgres passwords).
  { table: 'destinations', column: 'encrypted_secrets', salt: 'opensteward-destinations-v1' },
]

/**
 * Encrypted columns that live in the `admin-api` db (default:
 * `data/admin.db`).
 */
export const ADMIN_API_BLOBS: EncryptedBlob[] = [
  // IdentityStore — SSO provider secrets (OIDC client secret, LDAP bind
  // password, SAML SP private key + IdP signing cert as a JSON bundle).
  { table: 'identity_providers', column: 'secret_enc', salt: 'opensteward-sso-v1' },
  // IdentityStore — OAuth PKCE code_verifier on in-flight SSO transactions.
  { table: 'sso_transactions', column: 'code_verifier', salt: 'opensteward-sso-v1' },
]

/**
 * Hash-only stores — DO NOT include these in rotation. They hash plaintext
 * via scrypt and store only the hash, so the original token can't be
 * recovered and re-hashing during rotation isn't possible.
 *
 * **STORE_SECRET rotation invalidates every row in these tables.** The
 * scrypt hash mixes `${salt}|${secret}` as the KDF salt (see
 * `api-keys.ts:119` and `end-user-tokens.ts:69`), so rotating `STORE_SECRET`
 * changes the expected hash and existing tokens stop verifying. Every API
 * key and end-user token must be re-issued after a rotation; document
 * that in the runbook and treat it as an unavoidable cost of rotation.
 *
 * Listed here so the rotation runbook + CLI can warn operators by name.
 */
export const HASH_ONLY_STORES = [
  'developer_api_keys', // ApiKeyStore
  'end_user_tokens', // EndUserTokenStore
] as const
