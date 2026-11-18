/**
 * inSign REST API constants.
 *
 * inSign (is2 GmbH) is an EU-hosted, eIDAS-compliant e-signature platform.
 * Signing work is organised around a *session* (a "Vorgang"): a session
 * bundles one or more documents, a set of signature fields, and the external
 * recipients invited to sign. There is no account-wide "list all sessions"
 * surface — sessions are addressed by their `sessionid` — so the adapter
 * implements per-session reads only.
 *
 * Sandbox is open and shared (fixed Basic credentials, no signup); production
 * runs on a customer-specific instance whose base URL + credentials are issued
 * after a successful sandbox test. The base URL is therefore resolved at
 * runtime from `credentials.extra.baseUrl`, defaulting to the public sandbox.
 *
 * Docs: https://github.com/getinsign/insign-getting-started
 *       https://getinsign.github.io/insign-getting-started/guide.html
 */

/** Public sandbox host. Production instances supply their own base URL. */
export const SANDBOX_BASE_URL = 'https://sandbox.test.getinsign.show'

/** Fallback base URL when the connection does not pin a production host. */
export const DEFAULT_BASE_URL = SANDBOX_BASE_URL

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100

export const DEFAULT_SCOPES: string[] = []
