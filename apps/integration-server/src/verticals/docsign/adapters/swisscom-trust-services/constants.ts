/**
 * Swisscom Trust Services — All-in Signing Service (AIS) REST/JSON API constants.
 *
 * AIS is an OASIS-DSS-compliant remote-signing service. Documents never leave
 * the customer estate: only the document *hash* is transferred, signed, and a
 * detached signature is returned. Signing runs as an asynchronous transaction —
 * a `signRequest` returns a `ResponseID`, then the client polls `/pending`
 * until the `ResultMajor` flips from Pending to Success (or an error URN).
 *
 * Auth: the modern Swisscom Trust Services platform fronts AIS with an OAuth2
 * client-credentials grant (ETSI TS 119 432 remote-signing profile); the
 * issued bearer token is sent as `Authorization: Bearer <token>`. The legacy
 * estate used mTLS client certificates instead.
 *
 * Base URL + endpoints:
 *   REST:  https://ais.swisscom.com/AIS-Server/rs/v1.0/sign
 *          https://ais.swisscom.com/AIS-Server/rs/v1.0/pending
 *
 * Docs:
 *   Reference Guide: https://documents.swisscom.com/product/1000255-Digital_Signing_Service/
 *   Developer site:  https://dev.trustservices.swisscom.com/
 */

/** AIS REST API version segment. */
export const API_VERSION = 'v1.0'

/** Production REST base URL. */
export const PROD_BASE_URL = 'https://ais.swisscom.com'

/** Test / pre-production REST base URL. */
export const TEST_BASE_URL = 'https://ais.pre.swisscom.com'

/** Default base URL when the customer does not override it. */
export const DEFAULT_BASE_URL = PROD_BASE_URL

/** Path of the signing endpoint, relative to `${base}/AIS-Server/rs/${API_VERSION}`. */
export const SIGN_PATH = 'sign'

/** Path of the pending (poll) endpoint, relative to `${base}/AIS-Server/rs/${API_VERSION}`. */
export const PENDING_PATH = 'pending'

/**
 * OAuth2 client-credentials token endpoint (Swisscom Trust Services IdP).
 * The bearer token returned here is presented to the AIS REST endpoints.
 */
export const OAUTH_TOKEN_URL =
  'https://auth.trustservices.swisscom.com/api/auth/realms/broker/protocol/openid-connect/token'

/** Default OAuth scope for the remote-signing grant. */
export const DEFAULT_SCOPES = ['sign']

/**
 * DSS profile pinned on every request/response. AIS pins this exact value on
 * the `@Profile` attribute of the SignRequest envelope.
 */
export const AIS_PROFILE = 'http://ais.swisscom.ch/1.1'

/**
 * Additional-profile URN that marks a request as asynchronous. On-Demand
 * signatures with step-up authentication are always asynchronous, so a
 * transaction can be polled by its `ResponseID`.
 */
export const ASYNC_PROFILE = 'urn:oasis:names:tc:dss:1.0:profiles:asynchronousprocessing'

// ── Result-major URNs (transaction outcome) ─────────────────────────────────

export const RESULT_MAJOR_SUCCESS = 'urn:oasis:names:tc:dss:1.0:resultmajor:Success'
export const RESULT_MAJOR_PENDING =
  'urn:oasis:names:tc:dss:1.0:profiles:asynchronousprocessing:resultmajor:Pending'
export const RESULT_MAJOR_REQUESTER_ERROR =
  'urn:oasis:names:tc:dss:1.0:resultmajor:RequesterError'
export const RESULT_MAJOR_RESPONDER_ERROR =
  'urn:oasis:names:tc:dss:1.0:resultmajor:ResponderError'
export const RESULT_MAJOR_SUBSYSTEM_ERROR = 'http://ais.swisscom.ch/1.0/resultmajor/SubsystemError'

// ── Result-minor URNs of interest (step-up outcomes) ────────────────────────

export const RESULT_MINOR_STEPUP_CANCEL =
  'http://ais.swisscom.ch/1.1/resultminor/subsystem/StepUp/cancel'
export const RESULT_MINOR_STEPUP_TIMEOUT =
  'http://ais.swisscom.ch/1.1/resultminor/subsystem/StepUp/timeout'
