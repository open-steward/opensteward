/**
 * NMI (Network Merchants Inc.) Payment + Query API hosts.
 *
 * NMI exposes two form-encoded endpoints under the same host:
 *  - Payment API  → POST /api/transact.php  (sale / auth / capture / void / refund)
 *  - Query API    → POST /api/query.php     (transaction + customer-vault reports)
 *
 * Both are authenticated with a single API `security_key` generated in the
 * merchant control panel (Settings → Security Keys, type "API"). The merchant
 * picks sandbox or production by which host their key was issued against, so we
 * expose the host as a credential-form choice.
 *
 * Docs: https://docs.nmi.com/reference/transactions-processing
 *       https://docs.nmi.com/reference/query
 */
export const HOSTS = {
  sandbox: 'https://sandbox.nmi.com',
  live: 'https://secure.nmi.com',
} as const

export type NmiEnvironment = keyof typeof HOSTS
export const DEFAULT_ENVIRONMENT: NmiEnvironment = 'sandbox'

/** Payment API — transaction processing (sale, auth, capture, void, refund). */
export const TRANSACT_PATH = '/api/transact.php'

/** Query API — transaction + customer-vault reporting. */
export const QUERY_PATH = '/api/query.php'

/** NMI caps a single Query API page at 200 rows. */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 200
