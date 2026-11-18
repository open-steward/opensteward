import { XeroClient } from './client'
import type { Credentials } from '../../adapter/interface'
import type { XeroAccount } from './transform/account'

/**
 * Resolve a chart-of-accounts CODE to the id `get_accounts` answers to.
 *
 * Xero is inconsistent about this. Invoice, bill, credit-note and bank
 * transaction line items carry both `AccountCode` and `AccountID`; Quote and
 * PurchaseOrder line items carry only the code. So `accountId` came out
 * populated on five entities and absent on three — worse than the wrong value
 * Finding 17 originally reported, because there is nothing to notice and no
 * route to the account at all.
 *
 * The code is not a substitute. It is a per-organisation label that Xero
 * guarantees neither unique nor stable, so a client cannot join on it, and
 * `Account.customerDefinedCode` is where it already lives.
 *
 * Resolution therefore needs the accounts collection, which is one extra
 * upstream call. It is cached per organisation because a chart of accounts is
 * close to static — the whole demo org has 58 accounts and they change on
 * human timescales — and because Xero's rate limit is 60 calls a minute, which
 * a per-request fetch would spend fast on a paging client.
 */

/** Long enough to stay off the rate limit, short enough that a new account
 *  becomes joinable within a coffee break. */
const TTL_MS = 5 * 60_000

interface Entry {
  at: number
  byCode: Map<string, string>
}

const cache = new Map<string, Entry>()

/** Exported for tests — a module-level cache otherwise leaks across cases. */
export function _resetAccountIndex(): void {
  cache.clear()
}

function keyFor(credentials: Credentials): string {
  // The Xero tenant IS the organisation, and a chart of accounts belongs to
  // one. Keying on the access token instead would miss the cache after every
  // refresh, i.e. hourly.
  return credentials.tenantId ?? `token:${credentials.accessToken}`
}

export async function accountIdByCode(credentials: Credentials): Promise<Map<string, string>> {
  const key = keyFor(credentials)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.byCode

  const client = new XeroClient(credentials)
  const res = await client.get<{ Accounts: XeroAccount[] }>('Accounts')
  const byCode = new Map<string, string>()
  for (const a of res.Accounts ?? []) {
    if (a.Code && a.AccountID) byCode.set(String(a.Code), a.AccountID)
  }
  cache.set(key, { at: Date.now(), byCode })
  return byCode
}

interface HasLineItems {
  lineItems?: Array<{ accountId?: string | null; accountCode?: string | null }> | null
}

/**
 * Fill in `accountId` from `accountCode` wherever the platform did not supply
 * one. Never overwrites an id Xero did provide — that one is authoritative and
 * a code collision must not be able to replace it.
 *
 * Applied after the transform rather than inside it: the transforms are pure
 * by contract (2,186 accounting tests assert `transform(raw).metadata === raw`)
 * and cannot perform I/O.
 */
export function fillAccountIds<T extends HasLineItems>(records: T[], byCode: Map<string, string>): T[] {
  for (const record of records) {
    for (const line of record.lineItems ?? []) {
      if (line.accountId) continue
      const code = line.accountCode
      if (!code) continue
      const id = byCode.get(String(code))
      if (id) line.accountId = id
    }
  }
  return records
}

/**
 * Resolve and fill in one step, degrading to the unresolved records if the
 * accounts call fails.
 *
 * A missing `accountId` is the status quo for these entities; failing the
 * whole list because a secondary lookup errored would turn a partial answer
 * into no answer.
 */
export async function withResolvedAccountIds<T extends HasLineItems>(
  credentials: Credentials,
  records: T[],
  onError?: (err: unknown) => void,
): Promise<T[]> {
  if (records.length === 0) return records
  // Nothing to resolve — every line already carries an id.
  const needsResolution = records.some((r) =>
    (r.lineItems ?? []).some((l) => !l.accountId && l.accountCode),
  )
  if (!needsResolution) return records

  try {
    return fillAccountIds(records, await accountIdByCode(credentials))
  } catch (err) {
    onError?.(err)
    return records
  }
}
