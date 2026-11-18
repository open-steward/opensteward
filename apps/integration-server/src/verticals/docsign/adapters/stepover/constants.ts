/**
 * StepOver webSignatureOffice ("Tyr" web service) constants.
 *
 * StepOver's cloud e-signature product is webSignatureOffice. Integrators
 * drive it through the Tyr web service, an XML-RPC endpoint (a JSON-RPC
 * binding also exists; this adapter speaks XML-RPC). Auth is a session:
 * `tyrservice.login(username, password)` returns a session id that every
 * subsequent call passes as its first argument. A separate request-signing
 * shared secret is SHA-1-hashed over the request body and sent as the
 * `X-SOSIGNATURE` header.
 *
 * The Tyr service is intentionally narrow: a process ("document") is created
 * by uploading an ESign XML, its status is polled by id, and the finished
 * artifact is retrieved as XML. There is NO list endpoint, NO recipient-read
 * endpoint, NO template endpoint, and NO audit-trail endpoint — so the adapter
 * implements only what the API actually exposes (see index.ts).
 *
 * Docs: https://stepoverinfo.atlassian.net/wiki/spaces/WEBSO/pages (a) Tyr Webservice)
 */

/** Production Tyr web-service endpoint (XML-RPC). */
export const API_BASE_URL = 'https://www.websignatureoffice.com/tyrservice'

/** Public StepOver test instance for the Tyr web service. */
export const SANDBOX_BASE_URL = 'https://tyrservicetest.webso.stepover.de/tyrservice'

/** HTTP header carrying the SHA-1(request-body + signing secret) signature. */
export const REQUEST_SIGNATURE_HEADER = 'X-SOSIGNATURE'

/**
 * Signature-request status codes returned by
 * `tyrservice.getDocumentSignatureRequestStatus`.
 */
export const STATUS_NEW = 1
export const STATUS_PARTIAL_SIGNED = 2
export const STATUS_FINISHED = 3
export const STATUS_FAILED = 4
