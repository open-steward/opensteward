/**
 * 1C:Enterprise accounting adapter.
 *
 * 1C:Enterprise is a customizable ERP/accounting platform: each customer's
 * infobase publishes its own OData service, and the entity sets on it are
 * named `<Type>_<ObjectName>` by that infobase's own configuration objects
 * (e.g. `Catalog_Контрагенты`, `Document_РеализацияТоваровУслуг`,
 * `AccumulationRegister_ТоварыНаСкладах`) — not by 1C itself. There is no
 * fixed, platform-wide entity vocabulary a generic adapter can hardcode.
 *
 * This adapter previously called 13 invented English entity-set names
 * (`Organization`, `InvoiceOut`, `InvoiceIn`, `Counterparty`,
 * `ChartOfAccounts`, `AccountingRegisterRecordset`,
 * `AccumulationRegisterRecordset`, `TaxRate`, `ExpenseReport`,
 * `CorrectionInvoice`, `Order`, `SalesOrder`, `PurchaseOrder`) across 25
 * methods. None follows the `<Type>_<ObjectName>` rule and none exists on
 * the reference host: a live probe of
 * `demo.1c.ru/odata/standard.odata/InvoiceOut` returns a 404 HTML SPA page,
 * not OData. All 25 methods were removed; see resource coverage below.
 *
 * Auth: `getAuthUrl`/`exchangeCode`/`refreshCredentials` implement OAuth2
 * authorization_code against `demo.1c.ru/oauth/...` only because
 * `BaseAdapter` requires them — they are unreachable in practice. The
 * working Connect Link path is the `credentialFields`/`exchangeCredentials`
 * custom form (OData publication URL + access token). 1C
 * OData itself authenticates with HTTP Basic, not OAuth or a bearer token
 * (per the live probes); that mismatch is left untouched here — it is a
 * separate, unfiled defect, not part of this phantom-method removal.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────────
 * Unavailable: account       — 1C OData entity sets are named `<Type>_<ObjectName>` by each infobase's own configuration, not by 1C itself; the adapter's invented `ChartOfAccounts` follows neither the naming rule nor exists on the reference host (GET demo.1c.ru/odata/standard.odata/ChartOfAccounts returns a 404 HTML page, not OData)
 * Unavailable: bill          — 1C OData entity sets are named `<Type>_<ObjectName>` by each infobase's own configuration, not by 1C itself; the adapter's invented `InvoiceIn` follows neither the naming rule nor exists on the reference host (GET demo.1c.ru/odata/standard.odata/InvoiceIn returns a 404 HTML page, not OData)
 * Unavailable: contact       — 1C OData entity sets are named `<Type>_<ObjectName>` by each infobase's own configuration, not by 1C itself; the adapter's invented `Counterparty` follows neither the naming rule nor exists on the reference host (GET demo.1c.ru/odata/standard.odata/Counterparty returns a 404 HTML page, not OData)
 * Unavailable: creditmemo    — 1C OData entity sets are named `<Type>_<ObjectName>` by each infobase's own configuration, not by 1C itself; the adapter's invented `CorrectionInvoice` follows neither the naming rule nor exists on the reference host (GET demo.1c.ru/odata/standard.odata/CorrectionInvoice returns a 404 HTML page, not OData)
 * Unavailable: expense       — 1C OData entity sets are named `<Type>_<ObjectName>` by each infobase's own configuration, not by 1C itself; the adapter's invented `ExpenseReport` follows neither the naming rule nor exists on the reference host (GET demo.1c.ru/odata/standard.odata/ExpenseReport returns a 404 HTML page, not OData)
 * Unavailable: invoice       — 1C OData entity sets are named `<Type>_<ObjectName>` by each infobase's own configuration, not by 1C itself; the adapter's invented `InvoiceOut` follows neither the naming rule nor exists on the reference host (GET demo.1c.ru/odata/standard.odata/InvoiceOut returns a 404 HTML page, not OData)
 * Unavailable: journal       — 1C OData entity sets are named `<Type>_<ObjectName>` by each infobase's own configuration, not by 1C itself; the adapter's invented `AccountingRegisterRecordset` follows neither the naming rule nor exists on the reference host (GET demo.1c.ru/odata/standard.odata/AccountingRegisterRecordset returns a 404 HTML page, not OData)
 * Unavailable: order         — 1C OData entity sets are named `<Type>_<ObjectName>` by each infobase's own configuration, not by 1C itself; the adapter's invented `Order` follows neither the naming rule nor exists on the reference host (GET demo.1c.ru/odata/standard.odata/Order returns a 404 HTML page, not OData)
 * Unavailable: organization  — 1C OData entity sets are named `<Type>_<ObjectName>` by each infobase's own configuration, not by 1C itself; the adapter's invented `Organization` follows neither the naming rule nor exists on the reference host (GET demo.1c.ru/odata/standard.odata/Organization returns a 404 HTML page, not OData)
 * Unavailable: purchaseorder — 1C OData entity sets are named `<Type>_<ObjectName>` by each infobase's own configuration, not by 1C itself; the adapter's invented `PurchaseOrder` follows neither the naming rule nor exists on the reference host (GET demo.1c.ru/odata/standard.odata/PurchaseOrder returns a 404 HTML page, not OData)
 * Unavailable: salesorder    — 1C OData entity sets are named `<Type>_<ObjectName>` by each infobase's own configuration, not by 1C itself; the adapter's invented `SalesOrder` follows neither the naming rule nor exists on the reference host (GET demo.1c.ru/odata/standard.odata/SalesOrder returns a 404 HTML page, not OData)
 * Unavailable: taxrate       — 1C OData entity sets are named `<Type>_<ObjectName>` by each infobase's own configuration, not by 1C itself; the adapter's invented `TaxRate` follows neither the naming rule nor exists on the reference host (GET demo.1c.ru/odata/standard.odata/TaxRate returns a 404 HTML page, not OData)
 * Unavailable: transaction   — 1C OData entity sets are named `<Type>_<ObjectName>` by each infobase's own configuration, not by 1C itself; the adapter's invented `AccumulationRegisterRecordset` follows neither the naming rule nor exists on the reference host (GET demo.1c.ru/odata/standard.odata/AccumulationRegisterRecordset returns a 404 HTML page, not OData)
 */

import type { AccountingAdapter, Credentials } from '../../adapter/interface'

import { ONECENT_CREDENTIAL_FORM } from './auth'

interface OneCEnterpriseAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class OneCEnterpriseAdapter implements AccountingAdapter {

  // Connect Link support — OData publication URL + access token (see auth.ts).

  credentialFields = ONECENT_CREDENTIAL_FORM.credentialFields

  exchangeCredentials = ONECENT_CREDENTIAL_FORM.exchangeCredentials

  readonly platform = '1centerprise'
  readonly version = '0.1.0'
  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: OneCEnterpriseAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

  // `AccountingAdapter` requires these three, so they stay — as explicit
  // refusals rather than a flow pointing at endpoints that 404. 1C is
  // installed per customer: there is no central authorization server for an
  // OAuth2 dance to happen against, which is why the old constants pointed at
  // a vendor demo site. The credential form above is the only connect path.
  private static readonly NO_OAUTH =
    '1C:Enterprise has no OAuth2 flow — each customer publishes their own infobase. ' +
    'Connect it with the infobase user and password (HTTP Basic), or an accessTokenAuthentication token.'

  getAuthUrl(): string {
    throw new Error(OneCEnterpriseAdapter.NO_OAUTH)
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error(OneCEnterpriseAdapter.NO_OAUTH)
  }

  // Neither transport issues a refreshable grant: HTTP Basic has nothing to
  // refresh, and an accessTokenAuthentication JWT is minted by the customer's
  // own publication. Returning the credentials unchanged keeps the refresh
  // worker a no-op instead of a recurring failure.
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }
}
