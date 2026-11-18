import type { Carrier } from '../../../schema/carrier'

/**
 * One carrier partner account from `GET /api/v1/fetch-accounts`
 * (https://docs.clickpost.ai/reference/fetch-accounts-from-clickpost-1):
 *
 *   `courier_partner_id`  num      The carrier partner ID
 *   `courier_name`        string   The name of the carrier partner
 *   `account_code`        string   The account configured under a carrier partner
 *   `account_active`      boolean  Whether the carrier account is active or not
 */
export interface ClickPostAccount {
  courier_partner_id: number
  courier_name?: string
  account_code?: string
  account_active?: boolean
}

/**
 * Group the account list into one Carrier per carrier partner.
 *
 * A carrier partner can hold several accounts (the documented example lists
 * four Delhivery accounts under `courier_partner_id: 4`). The partner ID is
 * what order creation takes as `courier_partner`, so it is the carrier's id;
 * each account becomes a service keyed by its `account_code`, the value order
 * creation takes as `account_code`. Rows keep the order of their first
 * account in the response.
 */
export function transformCarriers(accounts: readonly ClickPostAccount[]): Carrier[] {
  const byPartner = new Map<number, ClickPostAccount[]>()
  for (const account of accounts) {
    const group = byPartner.get(account.courier_partner_id)
    if (group) group.push(account)
    else byPartner.set(account.courier_partner_id, [account])
  }
  return [...byPartner.entries()].map(([partnerId, group]) => transformCarrier(partnerId, group))
}

function transformCarrier(partnerId: number, accounts: ClickPostAccount[]): Carrier {
  const name = accounts.find((a) => a.courier_name)?.courier_name
  const withActive = accounts.filter((a) => typeof a.account_active === 'boolean')
  return {
    id: String(partnerId),
    code: String(partnerId),
    ...(name ? { name } : {}),
    services: accounts
      .filter((a): a is ClickPostAccount & { account_code: string } => !!a.account_code)
      .map((a) => ({ code: a.account_code })),
    ...(withActive.length > 0 ? { isActive: withActive.some((a) => a.account_active) } : {}),
    metadata: { accounts },
  }
}
