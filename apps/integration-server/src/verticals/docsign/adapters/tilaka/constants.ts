/**
 * Tilaka Sign+ managed-API constants.
 *
 * Tilaka (PT Tilaka Nusa Teknologi, tilaka.id) is an Indonesian certified
 * trust-service provider (PSrE). Its "Sign+" managed API authenticates
 * server-to-server callers with a client-credentials grant and then exposes
 * the signing surface on the SAME host under the `plus-*` route family:
 *
 *   POST /auth                 → client-credentials token (Bearer)
 *   POST /plus-upload          → upload a PDF, returns its `filename` handle
 *   POST /plus-requestsign     → create a signing request (the "envelope")
 *   POST /plus-executesign     → execute a signer's signature
 *   POST /plus-checksignstatus → read a signing request's status + detail
 *
 * A *signing request*, keyed by `request_id`, IS the envelope: it carries
 * its document(s) (`list_pdf` / `filename`), its signers (`signatures[]` /
 * `tilaka_name`), the initiator and the workflow status inline. The status
 * is read per `request_id` via `/plus-checksignstatus` — Tilaka exposes no
 * documented "list all requests" endpoint on the managed signing API, so
 * the adapter is request-scoped (get/list within a request), not list-all.
 *
 * Auth is a client-credentials grant (client id + client secret), collected
 * via the Connect Link credential form, not an OAuth Authorization-Code
 * flow; the chosen environment selects the host and is stored on
 * `credentials.extra.baseUrl` for the client + the refresh grant to reuse.
 *
 * Product: https://tilaka.id/features/
 * API host: https://sb-api.tilaka.id (sandbox), https://api.tilaka.id (production)
 */

/** Production Sign+ host (auth + signing live here). */
export const PROD_BASE_URL = 'https://api.tilaka.id'

/** Sandbox Sign+ host. */
export const SANDBOX_BASE_URL = 'https://sb-api.tilaka.id'

/** Environment slug → API host. The credential form offers these as a closed set. */
export const ENVIRONMENT_BASE_URLS: Record<string, string> = {
  production: PROD_BASE_URL,
  sandbox: SANDBOX_BASE_URL,
}

/** Default host when the customer does not pick an environment. */
export const API_BASE_URL = PROD_BASE_URL

/** Client-credentials token endpoint (relative to the chosen host). */
export const AUTH_PATH = '/auth'

/** Sign+ signing routes (relative to the chosen host). */
export const UPLOAD_PATH = '/plus-upload'
export const REQUEST_SIGN_PATH = '/plus-requestsign'
export const EXECUTE_SIGN_PATH = '/plus-executesign'
export const CHECK_SIGN_STATUS_PATH = '/plus-checksignstatus'
