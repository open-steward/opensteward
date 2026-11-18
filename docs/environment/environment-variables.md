# Environment Variables

> **Auto-generated** from each vertical's `src/verticals/<name>/platforms/metadata.ts`.
> Re-generate with `pnpm --filter integration-server run generate:env-doc`.

## Core service

| Variable | Description |
|---|---|
| `PORT` | HTTP port. Default `3010` (also published on the host as `3010` by the docker-compose service). |
| `HOST` | Bind address. Default `0.0.0.0`. |
| `STORE_PATH` | SQLite file for the credential + adapter-settings store. Default `./data/credentials.db`. |
| `STORE_SECRET` | Symmetric encryption key for stored credentials. **≥ 32 characters required.** |
| `DATABASE_URL` | Optional. A `postgres://` (or `postgresql://`) connection string. Set and non-empty, the service keeps its credential store, sync jobs and resource cache in that Postgres database instead of the SQLite files (`STORE_PATH`, `DATA_STORE_PATH`); unset, it uses SQLite. Any other value fails boot rather than falling back to SQLite. admin-api and webhook-gateway read the same variable for their own databases. Read-only SQL access and Superset need it. To move an existing deployment's data, see [operations/switching-databases.md](../operations/switching-databases.md). |
| `ADMIN_SECRET` | Required on `/admin/*` routes when set. Unset + `NODE_ENV != production` = unrestricted (dev only). |
| `RATE_LIMIT_MAX` | Optional global rate-limit cap (requests per window). |
| `RATE_LIMIT_WINDOW_MS` | Optional global rate-limit window in milliseconds. |
| `REDIS_URL` | Optional. When set, per-API-key rate limits use Redis instead of an in-process token bucket — required for horizontally-scaled deployments to share one budget per key. Format: `redis://[:password@]host:port[/db]`. `docker compose --profile scale up -d` brings up a local Redis. |
| `REFRESH_WORKER_INTERVAL_MS` | How often the keep-alive worker ticks. Default `900000` (15 min), chosen so a one-hour access token is renewed before it lapses. A tick only refreshes connections whose token is near expiry, so the cost is roughly one token request per connection per token lifetime. |
| `REFRESH_WORKER_EXPIRING_WITHIN_MS` | Renew a token lapsing inside this window. Default `1800000` (30 min) — two ticks of headroom, so one missed tick does not strand a connection. Raise it to reduce token-endpoint traffic at the cost of connections sitting expired between uses. |
| `REFRESH_WORKER_KEEP_WARM_MS` | Cadence for grants with no access-token expiry — nothing to keep fresh, just exercised occasionally so providers that drop unused refresh tokens don't. Default `72000000` (20h). |
| `SERVICE_SECRET` | Shared secret this service presents to admin-api (as `X-Service-Secret`) when polling operator-tuned runtime settings — rate limits, feature flags. Mirrors `ADMIN_SECRET`, which authenticates the opposite direction, and is deliberately a *different* value so a compromise of one service does not open both paths. Unset means the poll is rejected and every setting falls back to its env/compiled default. Generate with `scripts/generate-secrets.sh`. |
| `CORS_ORIGIN` | Comma-separated origins allowed to call this API from a browser. Empty (default) sends no `Access-Control-*` headers, which is what a Bearer-token API wants. Set it to the docs-server origin to use the Swagger console's "Try it out" — that console is served from another origin, so the browser preflights every call. docker-compose defaults it to `http://localhost:3003`. Avoid `*` on any deployment whose API keys can write. |
| `PUBLIC_BASE_URL` | Optional canonical public URL — overrides the company-info baseUrl + `Host` header when emitting Connect Link / OAuth callback URLs. Set when the service is behind a custom-domain reverse proxy. |
| `DESTINATIONS_WORKER` | Set `off` to stop the destination export scheduler (Parquet to S3/GCS/Azure, or Postgres — see [integrate/destinations.md](../integrate/destinations.md)). Manual runs from the admin API still work. Default on whenever the data store is on. |
| `DESTINATIONS_WORKER_INTERVAL_MS` | How often the destination scheduler looks for due destinations. Default `30000`; each destination still runs at its own interval. |
| `SYNC_SCHEDULER_INTERVAL_MS` | How often the sync scheduler looks for connections whose sync schedule is due. Default `60000`, minimum `5000`. How often each connection syncs is its own schedule plus the `data_store.sync.default_interval_minutes` runtime setting; turn scheduling off with `data_store.sync.scheduler_enabled`. |
| `DESTINATIONS_ALLOW_PRIVATE_HOSTS` | Comma-separated host names a destination may point at although they resolve to private addresses (MinIO next to the stack, a Postgres on the LAN). Every other destination host must resolve to public addresses. |
| `ANALYTICS_ADMIN_DATABASE_URL` | Postgres only. A `postgres://` URL for a role with `CREATEROLE` that owns (or may `GRANT` on) the store tables. When set, read-only SQL access is *managed*: the service provisions the views (again on boot whenever the view catalog changed) and creates, rotates and revokes SQL principals itself. Unset = *manual* mode: it only generates the SQL. See [deployment/postgres-analytics.md](../deployment/postgres-analytics.md). |
| `ANALYTICS_ROLE_PREFIX` | Prefix for every Postgres role read-only SQL access creates (`<prefix>_analytics_owner`, `<prefix>_sql_<name>_<id>`, …). Roles are cluster-global, so deployments sharing a Postgres cluster need different prefixes. Default `os`. |
| `ANALYTICS_READ_HOST` | The host BI tools should connect to for read-only SQL access (e.g. a read replica), shown with each new SQL principal. |
| `CONFIG_PATH` | Override the default `./config/config.yml` location. |
| `NODE_ENV` | Set to `production` for production deployments. |

## Licensing

Read by integration-server only. admin-api reads its status from integration-server (`GET /admin/license`, which needs the same `ADMIN_SECRET` on both), and the admin console reads admin-api's `GET /api/license`. A missing or broken license never stops the service; it runs in community mode (1 connection, 1 tenant) and says so in its startup log. Installing and renewing: [deployment/license.md](../deployment/license.md).

| Variable | Description |
|---|---|
| `OPENSTEWARD_LICENSE` | The license token itself (`v4.public.…`). Wins over `OPENSTEWARD_LICENSE_FILE`, which is then ignored (with a warning when that file exists). Empty counts as unset. Keep it out of logs and CI output. |
| `OPENSTEWARD_LICENSE_FILE` | Path to the license file. Default: `license.key` next to the credential store (`dirname(STORE_PATH)`); docker-compose sets `/etc/opensteward/license/license.key`. Mount the **directory**, never the single file (a Kubernetes Secret without `subPath`, a compose bind mount of a folder), so a renewal applies without a restart. Must be readable by uid 1000. Empty counts as unset. |

## Admin UI & admin-api (SSO / identity)

Variables for the admin console (`admin` :3000) and its API (`admin-api` :3001),
including enterprise SSO (SAML / OIDC / LDAP) and SCIM provisioning. See
[deployment/sso-setup.md](../deployment/sso-setup.md) for the full setup walkthrough
and [architecture/sso-and-identity-providers.md](../architecture/sso-and-identity-providers.md)
for the design.

| Variable | Service | Description |
|---|---|---|
| `JWT_SECRET` | admin-api | Signs admin-session JWTs. **≥ 32 characters required.** |
| `SESSION_SECRET` | admin | Signs the admin UI session cookie. **≥ 32 characters required.** |
| `STORE_SECRET` | admin-api | Encrypts stored SSO provider secrets (client secret, LDAP bind password, SAML IdP cert) at rest. **Required for SSO; ≥ 32 characters.** Reuse the same value as the integration-server credential store. |
| `SSO_PUBLIC_BASE_URL` | admin-api + admin | Public, browser-/IdP-reachable base URL of admin-api. Where IdPs send SAML ACS & OIDC callbacks, where SCIM clients connect, and what the admin UI's "Sign in with …" links point at. Default `http://localhost:3001`. |
| `ADMIN_UI_URL` | admin-api | Public base URL of the admin UI — where admin-api redirects the post-login handoff. Default `http://localhost:3000`. |
| `ADMIN_API_URL` | admin | Server-to-server URL the admin UI uses to reach admin-api (e.g. `http://admin-api:3001` in Docker). |
| `DOCS_SERVER_URL` | admin | Browser-facing docs-server URL for cross-app links. |
| `SUPERSET_URL` | admin-api | Internal URL admin-api calls Apache Superset on (e.g. `http://superset:8088` in Docker). The embedded-Superset switch: unset or not an http(s) URL = off. `SUPERSET_PUBLIC_URL` (browser-facing; defaults to this) and the `SUPERSET_SERVICE_USERNAME` / `_PASSWORD` service account go with it. Postgres deployments only; see [deployment/superset.md](../deployment/superset.md). |
| `SESSION_COOKIE_SECURE` | admin | Whether the session and flash cookies carry `Secure`. Unset means `NODE_ENV === 'production'`, the right default for anything served over HTTPS. Set `false` **only** to serve the admin UI over plain HTTP to a non-`localhost` address — browsers will not store a `Secure` cookie there, so login fails silently. Doing so puts a control-plane session token on the wire in cleartext; prefer HTTPS or a tunnel. |

## OAuth adapter credentials

OAuth client credentials are **adapter settings, not environment variables**.
Each OAuth platform below reads `clientId`, `clientSecret` and
`redirectUri` — plus options some platforms take, such as `scopes` or
`sandbox` — from its adapter config, which is stored encrypted and survives
restarts. Set it on the platform's page in the admin UI
(`/platforms/{vertical}/{slug}`), or on integration-server's admin API
(`X-Admin-Secret`):

| Call | Effect |
|---|---|
| `POST /admin/platforms/{vertical}/{slug}/enable` with `{ "config": { … } }` | Enables the adapter. A `config` given here **replaces** the stored one; omit it to keep what is stored. |
| `PUT /admin/platforms/{vertical}/{slug}/config` with `{ "config": { … } }` | **Merges** into the stored config, key by key. A `null` value removes that key. |
| `GET /admin/platforms/{vertical}/{slug}/config` | Reads it back. The secret is never returned — `hasSecret` says whether one is set. |

Set `redirectUri` to exactly `{public base URL}/auth/{vertical}/{slug}/callback`
and register that same URL with the platform. The authorize request carries the
configured `redirectUri`; the token exchange sends the deployment's own
callback URL (`PUBLIC_BASE_URL` when set); a platform refuses an exchange whose
redirect URI differs from the authorize request's.

Apart from one deprecated fallback, no per-platform `*_CLIENT_ID` /
`*_SECRET` variable is read. Earlier versions of this page listed one for
every OAuth platform, and setting them had no effect. `eposnow` alone still
falls back to `EPOSNOW_CLIENT_ID`, `EPOSNOW_CLIENT_SECRET` and
`EPOSNOW_REDIRECT_URI` for any key its adapter config leaves unset. That
fallback is deprecated and will be removed; move the values into the adapter
config. (Compose never forwarded these variables, so under Compose the fallback
has never applied.)

| Vertical | Slug | Platform |
|---|---|---|
| accounting | `a2x` | A2X |
| accounting | `abacus-ch` | Abacus |
| accounting | `accountable` | Accountable |
| accounting | `accountingseed` | Accounting Seed |
| accounting | `accountsiq` | AccountsIQ |
| accounting | `accountsportal` | AccountsPortal |
| accounting | `accurate` | Accurate Online |
| accounting | `acumatica` | Acumatica |
| accounting | `anfix` | Anfix |
| accounting | `autocount` | AutoCount Cloud |
| accounting | `axonaut` | Axonaut |
| accounting | `bexio` | bexio |
| accounting | `bling` | Bling |
| accounting | `bokio` | Bokio |
| accounting | `brex` | Brex |
| accounting | `cegid` | Cegid |
| accounting | `certinia` | Certinia |
| accounting | `conta` | Conta |
| accounting | `contaazul` | ContaAzul |
| accounting | `contabilium` | Contabilium |
| accounting | `contpaqi` | ContPAQi |
| accounting | `crunch` | Crunch |
| accounting | `datev` | DATEV |
| accounting | `debitoor` | Debitoor |
| accounting | `deskera` | Deskera |
| accounting | `dext` | Dext |
| accounting | `digits` | Digits |
| accounting | `dinero` | Dinero |
| accounting | `duett` | Duett |
| accounting | `dynamics365bc` | Microsoft Dynamics 365 Business Central |
| accounting | `epsilonnet` | Epsilon Net |
| accounting | `exactonline` | Exact Online |
| accounting | `facturadirecta` | FacturaDirecta |
| accounting | `fatturecloud` | Fatture in Cloud |
| accounting | `fortnox` | Fortnox |
| accounting | `freeagent` | FreeAgent |
| accounting | `freee` | freee |
| accounting | `freshbooks` | FreshBooks |
| accounting | `gusto` | Gusto |
| accounting | `idoklad` | iDoklad |
| accounting | `jalebi` | Jalebi |
| accounting | `klara` | KLARA |
| accounting | `libeo` | Libeo |
| accounting | `medius` | Medius |
| accounting | `melio` | Melio |
| accounting | `misaamis` | MISA AMIS |
| accounting | `moloni` | Moloni |
| accounting | `moneybird` | Moneybird |
| accounting | `moneyforward` | Money Forward Cloud |
| accounting | `mri-software` | MRI Software |
| accounting | `myob` | MYOB |
| accounting | `myunisoft` | MyUnisoft |
| accounting | `netsuite` | Oracle NetSuite |
| accounting | `nuvemfiscal` | Nuvem Fiscal |
| accounting | `pandle` | Pandle |
| accounting | `parasut` | Parasut |
| accounting | `peakaccount` | PEAK |
| accounting | `pennylane` | Pennylane |
| accounting | `pleo` | Pleo |
| accounting | `poweroffice` | PowerOffice Go |
| accounting | `procountor` | Procountor |
| accounting | `puzzle` | Puzzle |
| accounting | `quickbooks` | QuickBooks Online |
| accounting | `quipu` | Quipu |
| accounting | `ramp` | Ramp |
| accounting | `reckon` | Reckon One |
| accounting | `reckon-one` | Reckon One |
| accounting | `regate` | Regate |
| accounting | `rillet` | Rillet |
| accounting | `sagebusinesscloud` | Sage Business Cloud |
| accounting | `sageintacct` | Sage Intacct |
| accounting | `sellsy` | Sellsy |
| accounting | `siigo` | Siigo |
| accounting | `silverfin` | Silverfin |
| accounting | `soldo` | Soldo |
| accounting | `speedledger` | SpeedLedger |
| accounting | `spendesk` | Spendesk |
| accounting | `spiris` | Spiris |
| accounting | `teamsystem` | TeamSystem |
| accounting | `tiime` | Tiime |
| accounting | `tiny` | Tiny ERP |
| accounting | `twentyfoursevenoffice` | 24SevenOffice |
| accounting | `twinfield` | Twinfield |
| accounting | `unimicro` | Unimicro |
| accounting | `unit4` | Unit4 |
| accounting | `visma` | Visma |
| accounting | `vismabusinessnxt` | Visma Business NXT |
| accounting | `vismanet` | Visma.net |
| accounting | `wave` | Wave |
| accounting | `xero` | Xero |
| accounting | `xledger` | Xledger |
| accounting | `yayoi` | Yayoi |
| accounting | `zervant` | Zervant |
| accounting | `zohobooks` | Zoho Books |
| crm | `1crm` | 1CRM |
| crm | `accelo` | Accelo |
| crm | `act-crm` | ACT! CRM |
| crm | `attio` | Attio |
| crm | `bexio` | Bexio |
| crm | `bitrix24` | Bitrix24 |
| crm | `bullhorn` | Bullhorn |
| crm | `capsule` | Capsule CRM |
| crm | `carerix` | Carerix |
| crm | `corteza-crm` | Corteza CRM |
| crm | `creatio` | Creatio |
| crm | `daylite` | Daylite |
| crm | `dynamics365-crm` | Microsoft Dynamics 365 |
| crm | `groove-sales` | Groove (Clari) |
| crm | `highlevel` | HighLevel |
| crm | `hubspot` | HubSpot |
| crm | `jobadder` | JobAdder |
| crm | `keap` | Keap |
| crm | `kommo` | Kommo |
| crm | `mautic` | Mautic |
| crm | `monday-crm` | Monday CRM |
| crm | `netsuite-crm` | NetSuite CRM |
| crm | `nimble` | Nimble |
| crm | `oracle-cx` | Oracle CX |
| crm | `orocrm` | OroCRM |
| crm | `outreach` | Outreach |
| crm | `pega-crm` | Pega CRM |
| crm | `pipedrive` | Pipedrive |
| crm | `podio` | Podio |
| crm | `rd-station-crm` | RD Station CRM |
| crm | `salesforce` | Salesforce |
| crm | `salesloft` | Salesloft |
| crm | `sellsy` | Sellsy |
| crm | `spiro` | Spiro |
| crm | `spotler-crm` | Spotler CRM |
| crm | `suitecrm` | SuiteCRM |
| crm | `superoffice` | SuperOffice |
| crm | `teamleader` | Teamleader Focus |
| crm | `vendasta` | Vendasta |
| crm | `vincere` | Vincere |
| crm | `webcrm` | webCRM |
| crm | `wix-crm` | Wix CRM |
| crm | `zendesk-sell` | Zendesk Sell |
| crm | `zoho-bigin` | Zoho Bigin |
| crm | `zoho-crm` | Zoho CRM |
| ecommerce | `alibaba` | Alibaba.com |
| ecommerce | `allegro` | Allegro |
| ecommerce | `amazon-sp` | Amazon Selling Partner API |
| ecommerce | `base-ec` | BASE |
| ecommerce | `bigcommerce` | BigCommerce |
| ecommerce | `bol` | Bol.com |
| ecommerce | `bold-commerce` | Bold Commerce |
| ecommerce | `cafe24` | Cafe24 |
| ecommerce | `cdiscount-marketplace` | Cdiscount Marketplace |
| ecommerce | `clover` | Clover |
| ecommerce | `colorme-shop` | Color Me Shop |
| ecommerce | `commercelayer` | Commerce Layer |
| ecommerce | `commercetools` | commercetools |
| ecommerce | `daraz` | Daraz |
| ecommerce | `ebay` | eBay |
| ecommerce | `elasticpath` | Elastic Path |
| ecommerce | `epages` | ePages |
| ecommerce | `eposnow` | Epos Now |
| ecommerce | `etsy` | Etsy |
| ecommerce | `fabric` | fabric |
| ecommerce | `facebook-shop` | Facebook Shop |
| ecommerce | `faire` | Faire |
| ecommerce | `flipkart` | Flipkart |
| ecommerce | `foxy-io` | Foxy.io |
| ecommerce | `fynd` | Fynd Platform |
| ecommerce | `gumroad` | Gumroad |
| ecommerce | `haravan` | Haravan |
| ecommerce | `instamojo` | Instamojo |
| ecommerce | `jdcom` | JD.com |
| ecommerce | `jimdo` | Jimdo |
| ecommerce | `joor` | JOOR |
| ecommerce | `jumia` | Jumia |
| ecommerce | `jumpseller` | Jumpseller |
| ecommerce | `kibo` | Kibo Commerce |
| ecommerce | `lazada` | Lazada |
| ecommerce | `lightspeed-retail` | Lightspeed Retail |
| ecommerce | `loyverse` | Loyverse |
| ecommerce | `mercadolibre` | Mercado Libre |
| ecommerce | `nhn-commerce` | NHN Commerce (Godomall / Shopby) |
| ecommerce | `noon` | Noon |
| ecommerce | `norce` | Norce Commerce |
| ecommerce | `orckestra` | Orckestra |
| ecommerce | `orocommerce` | OroCommerce |
| ecommerce | `otto-market` | OTTO Market |
| ecommerce | `patreon` | Patreon |
| ecommerce | `pinterest-shop` | Pinterest Shop |
| ecommerce | `plentyone` | PlentyONE (plentymarkets) |
| ecommerce | `revel` | Revel Systems |
| ecommerce | `salesforce-commerce-cloud` | Salesforce Commerce Cloud |
| ecommerce | `salla` | Salla |
| ecommerce | `sap-commerce` | SAP Commerce Cloud |
| ecommerce | `sellfy` | Sellfy |
| ecommerce | `sharetribe` | Sharetribe |
| ecommerce | `shopee` | Shopee |
| ecommerce | `shoper` | Shoper |
| ecommerce | `shopgate` | Shopgate |
| ecommerce | `shopify` | Shopify |
| ecommerce | `shoplazza` | Shoplazza |
| ecommerce | `shopline` | SHOPLINE |
| ecommerce | `shopware` | Shopware 6 |
| ecommerce | `shopware-b2b` | Shopware B2B |
| ecommerce | `solidus` | Solidus |
| ecommerce | `spree` | Spree Commerce |
| ecommerce | `spryker` | Spryker |
| ecommerce | `square` | Square |
| ecommerce | `tiendanube` | Tiendanube / Nuvemshop |
| ecommerce | `tiktok-shop` | TikTok Shop |
| ecommerce | `tmall` | Tmall / Taobao |
| ecommerce | `toast` | Toast |
| ecommerce | `tokopedia` | Tokopedia |
| ecommerce | `tray-commerce` | Tray (Tray Commerce) |
| ecommerce | `volusion` | Volusion |
| ecommerce | `walmart` | Walmart Marketplace |
| ecommerce | `webflow` | Webflow Ecommerce |
| ecommerce | `weebly` | Weebly (Square Online legacy) |
| ecommerce | `wish` | Wish |
| ecommerce | `wix` | Wix eCommerce |
| ecommerce | `zalando` | Zalando Marketplace |
| ecommerce | `zid` | Zid |
| ecommerce | `znode` | Znode |
| ecommerce | `zyro` | Zyro |
| logistics | `amazon-mcf` | Amazon Multi-Channel Fulfillment |
| logistics | `amazon-shipping` | Amazon Shipping |
| logistics | `amazon-sp-api` | Amazon SP-API |
| logistics | `auspost` | Australia Post |
| logistics | `blue-yonder` | Blue Yonder |
| logistics | `bluejay` | BluJay Solutions |
| logistics | `cainiao` | Cainiao Network |
| logistics | `cargo-one` | cargo.one |
| logistics | `cargowise` | CargoWise |
| logistics | `ch-robinson` | C.H. Robinson |
| logistics | `convoy` | Convoy |
| logistics | `correos` | Correos |
| logistics | `coyote` | Coyote Logistics |
| logistics | `dat` | DAT Freight & Analytics |
| logistics | `deliverect` | Deliverect |
| logistics | `deliveroo` | Deliveroo |
| logistics | `deutschepost` | Deutsche Post |
| logistics | `dhl` | DHL Express |
| logistics | `dhl-africa` | DHL Africa |
| logistics | `dhl-parcel-de` | DHL Parcel DE (Paket) |
| logistics | `doordash-drive` | DoorDash Drive |
| logistics | `dpd` | DPD |
| logistics | `dpd-de` | DPD Germany |
| logistics | `dpd-uk` | DPD UK |
| logistics | `e2open` | e2open |
| logistics | `easyship` | Easyship |
| logistics | `echo` | Echo Global Logistics |
| logistics | `endicia` | Endicia |
| logistics | `extensiv` | Extensiv (3PL Central) |
| logistics | `fareye` | FarEye |
| logistics | `fedex` | FedEx |
| logistics | `flexport` | Flexport |
| logistics | `gofreight` | GoFreight |
| logistics | `gojek-send` | Gojek GoSend |
| logistics | `grab-express` | Grab Express |
| logistics | `infor-wms` | Infor WMS |
| logistics | `jda` | JDA (Blue Yonder) |
| logistics | `loadsmart` | Loadsmart |
| logistics | `locate2u` | Locate2u |
| logistics | `logiwa` | Logiwa |
| logistics | `maersk` | Maersk |
| logistics | `manhattan-wms` | Manhattan WMS |
| logistics | `melhor-envio` | Melhor Envio |
| logistics | `mercurygate` | MercuryGate |
| logistics | `neurored` | Neurored |
| logistics | `ninja-van` | Ninja Van |
| logistics | `nzpost` | NZ Post |
| logistics | `old-dominion` | Old Dominion |
| logistics | `oracle-otm` | Oracle OTM |
| logistics | `parcel2go` | Parcel2Go |
| logistics | `pitney-bowes` | Pitney Bowes |
| logistics | `poste-italiane` | Poste Italiane |
| logistics | `project44` | project44 |
| logistics | `quiqup` | Quiqup |
| logistics | `royalmail` | Royal Mail |
| logistics | `sap-tm` | SAP Transportation Management |
| logistics | `shipbob` | ShipBob |
| logistics | `shiphero` | ShipHero |
| logistics | `shippeo` | Shippeo |
| logistics | `shiprocket` | Shiprocket |
| logistics | `stuart` | Stuart |
| logistics | `tforce-freight` | TForce Freight |
| logistics | `transplace` | Transplace |
| logistics | `transporeon` | Transporeon |
| logistics | `trimble-tms` | Trimble TMS |
| logistics | `trimble-truckmate` | Trimble TruckMate |
| logistics | `truckstop` | Truckstop |
| logistics | `turvo` | Turvo |
| logistics | `uber-direct` | Uber Direct |
| logistics | `uber-freight` | Uber Freight |
| logistics | `ups` | UPS |
| logistics | `webshipper` | Webshipper |
| logistics | `xpo` | XPO Logistics |
| docsign | `actasign` | actaSIGN |
| docsign | `adobe-acrobat-sign` | Adobe Acrobat Sign |
| docsign | `agiloft` | Agiloft |
| docsign | `autenti` | Autenti |
| docsign | `box-sign` | Box Sign |
| docsign | `conga-sign` | Conga Sign |
| docsign | `cryptomathic-signer` | Cryptomathic Signer |
| docsign | `d-trust-sign-me` | D-Trust sign-me |
| docsign | `dochub` | DocHub |
| docsign | `docusign` | DocuSign |
| docsign | `dropbox-sign` | Dropbox Sign |
| docsign | `getaccept` | GetAccept |
| docsign | `icertis` | Icertis |
| docsign | `ironclad` | Ironclad |
| docsign | `oneflow` | Oneflow |
| docsign | `pandadoc` | PandaDoc |
| docsign | `pdffiller` | pdfFiller |
| docsign | `rightsignature` | RightSignature |
| docsign | `scrive` | Scrive |
| docsign | `secured-signing` | Secured Signing |
| docsign | `signeasy` | SignEasy |
| docsign | `signicat` | Signicat |
| docsign | `signnow` | SignNow |
| docsign | `skribble` | Skribble |
| docsign | `swisscom-trust-services` | Swisscom Trust Services |
| docsign | `viafirma` | Viafirma |
| docsign | `yousign` | Yousign |
| docsign | `zealid` | ZealiD |
| docsign | `zoho-sign` | Zoho Sign |
| projects | `aha` | Aha! |
| projects | `airtable` | Airtable |
| projects | `asana` | Asana |
| projects | `avaza` | Avaza |
| projects | `awork` | awork |
| projects | `backlog` | Backlog |
| projects | `basecamp` | Basecamp |
| projects | `bitrix24` | Bitrix24 |
| projects | `buildertrend` | Buildertrend |
| projects | `clickup` | ClickUp |
| projects | `forecast` | Forecast |
| projects | `height` | Height |
| projects | `hive` | Hive |
| projects | `inloox` | InLoox |
| projects | `jira` | Jira |
| projects | `kantata` | Kantata |
| projects | `kintone` | Kintone |
| projects | `lark` | Lark |
| projects | `linear` | Linear |
| projects | `meistertask` | MeisterTask |
| projects | `microsoft-planner` | Microsoft Planner |
| projects | `microsoft-todo` | Microsoft To Do |
| projects | `monday` | Monday.com |
| projects | `nifty` | Nifty |
| projects | `notion` | Notion |
| projects | `ones` | ONES |
| projects | `openproject` | OpenProject |
| projects | `pingcode` | PingCode |
| projects | `plane` | Plane |
| projects | `procore` | Procore |
| projects | `productboard` | Productboard |
| projects | `productive` | Productive |
| projects | `projectplace` | Projectplace |
| projects | `quire` | Quire |
| projects | `smartsheet` | Smartsheet |
| projects | `stackfield` | Stackfield |
| projects | `suiteprojects-pro` | NetSuite SuiteProjects Pro (OpenAir) |
| projects | `teambition` | Teambition |
| projects | `teamgantt` | TeamGantt |
| projects | `teamwork` | Teamwork.com |
| projects | `todoist` | Todoist |
| projects | `tower` | Tower.im |
| projects | `weekdone` | Weekdone |
| projects | `wimi` | Wimi |
| projects | `workboard` | WorkBoard |
| projects | `workfront` | Adobe Workfront |
| projects | `worktile` | Worktile |
| projects | `wrike` | Wrike |
| projects | `yandex-tracker` | Yandex Tracker |
| projects | `youtrack` | YouTrack |
| projects | `zenkit` | Zenkit |
| projects | `zoho-bugtracker` | Zoho BugTracker |
| projects | `zoho-projects` | Zoho Projects |
| projects | `zoho-sprints` | Zoho Sprints |
| customer-support | `egain` | eGain |
| customer-support | `genesys-cloud` | Genesys Cloud CX |
| customer-support | `halopsa` | HaloPSA |
| customer-support | `hellotars-support` | HelpDesk (by LiveChat) |
| customer-support | `helpscout` | Help Scout |
| customer-support | `hiver` | Hiver |
| customer-support | `hubspot-service-hub` | HubSpot Service Hub |
| customer-support | `intercom` | Intercom |
| customer-support | `jira-service-management` | Jira Service Management |
| customer-support | `salesforce-service` | Salesforce Service Cloud |
| customer-support | `sprinklr-service` | Sprinklr Service |
| customer-support | `talkdesk` | Talkdesk |
| customer-support | `zendesk` | Zendesk |
| customer-support | `zoho-desk` | Zoho Desk |
| inventory | `acumatica-inventory` | Acumatica Inventory |
| inventory | `bling` | Bling |
| inventory | `blue-yonder` | Blue Yonder |
| inventory | `brightpearl` | Brightpearl |
| inventory | `channeladvisor` | Rithum (ChannelAdvisor) |
| inventory | `dynamics-365-bc-inventory` | Microsoft Dynamics 365 BC (Inventory) |
| inventory | `dynamics-365-scm` | Microsoft Dynamics 365 Supply Chain Management |
| inventory | `e2open` | E2open |
| inventory | `epicor-kinetic` | Epicor Kinetic |
| inventory | `extensiv-order-manager` | Extensiv Order Manager |
| inventory | `kinaxis` | Kinaxis Maestro |
| inventory | `lightspeed-inventory` | Lightspeed Commerce (Retail/Inventory) |
| inventory | `linnworks` | Linnworks |
| inventory | `logiwa-inventory` | Logiwa (Inventory) |
| inventory | `netsuite-inventory` | NetSuite Inventory |
| inventory | `oracle-wms` | Oracle Warehouse Management Cloud |
| inventory | `ordoro` | Ordoro |
| inventory | `revel-systems` | Revel Systems |
| inventory | `sap-ewm` | SAP Extended Warehouse Management |
| inventory | `sap-inventory` | SAP S/4HANA Inventory |
| inventory | `shipbob-inventory` | ShipBob (Inventory) |
| inventory | `shiphero-inventory` | ShipHero (Inventory) |
| inventory | `sos-inventory` | SOS Inventory |
| inventory | `sps-commerce` | SPS Commerce |
| inventory | `tecsys` | Tecsys |
| inventory | `tiny-erp` | Olist Tiny |
| inventory | `truecommerce` | TrueCommerce |
| inventory | `vend-pos` | Vend POS |
| inventory | `zoho-inventory` | Zoho Inventory |

## Non-OAuth adapter slugs

These platforms take credentials at connect time (API keys, basic auth,
session tokens), so they need no client credentials in their adapter config.

### accounting

`1centerprise`, `abraflexi`, `access-financials`, `acconomy`, `accountedge`, `accounteer`, `afas`, `aisino`, `akaunting`, `alegra`, `amanote`, `appfolio`, `aruba`, `avidxchange`, `bigcapital`, `bill4time`, `billin`, `billingo`, `billit`, `billomat`, `billy`, `bind-erp`, `bjornlunden`, `blackline`, `bluenext`, `bman`, `briox`, `buchhaltungsbutze`, `built-africa`, `bukku`, `busy`, `calxa`, `campfire`, `cashctrl`, `center`, `centiga`, `chanjet`, `chipax`, `clear`, `clearbooks`, `cloudfinance`, `cloudme`, `cmic`, `colppy`, `comarchoptima`, `contasimple`, `crater`, `cuentica`, `daftra`, `danea`, `dilovod`, `directo`, `dolibarr`, `dualentry`, `eboekhouden`, `economic`, `ecount`, `egestor`, `erpnext`, `evoliz`, `facturama`, `factusol`, `fakturoid`, `fakturownia`, `fastbill`, `fatoura`, `fatture24`, `fenbeitong`, `fiken`, `financio`, `finly`, `finmap`, `firefly-iii`, `flowaccount`, `focussoftnet`, `foundation`, `frontaccounting`, `geeyee`, `giddh`, `giobby`, `granatum`, `hinawi`, `holded`, `horizonerp`, `icount`, `ifirma`, `inbooks`, `infakt`, `insertnexo`, `invoice-ninja`, `invoiced`, `invoiceportal`, `invoiceq`, `invoicexpress`, `ipaidthat`, `jumis`, `karbon`, `kashflow`, `kashoo`, `kingdee`, `konturelba`, `kora`, `kwara`, `ledgers-cloud`, `ledgersmb`, `lessaccounting`, `lexoffice`, `logoyazilim`, `luca`, `manager`, `managerio`, `masteraccounting`, `maxio`, `mazeedone`, `mazuma`, `mekarijurnal`, `meritaktiva`, `mezan`, `mineraltree`, `morning`, `moss`, `moysklad`, `mybillbook`, `netvisor`, `nibo`, `octopus`, `odoo`, `omie`, `paga`, `paperlessngx`, `patriot`, `payhawk`, `peaccounting`, `pohoda`, `profitbooks`, `promikbook`, `prosvasis`, `qoyod`, `quickfile`, `realbooks`, `refrens`, `rivile`, `routable`, `saasu`, `sage50de`, `saldeo`, `sapb1`, `sberbusiness`, `scopevisio`, `sendregning`, `sevdesk`, `sila`, `simplbooks`, `sinao`, `sistemi`, `smacc`, `smartaccounts`, `smartbill`, `snelstart`, `stampli`, `stessa`, `sunrise`, `superbill`, `superfaktura`, `synder`, `systima`, `szamlazzhu`, `tallyprime`, `tipalti`, `torgsoft`, `tripletex`, `tyms`, `uhasibu`, `vhsys`, `vosfactures`, `wafeq`, `wfirma`, `whitebooks`, `wint`, `wisomeinbuero`, `wrebit`, `xubio`, `yonyou`, `yooz`, `yuki`, `zipbooks`, `zucchetti`

### crm

`activecampaign`, `affinity`, `agendor`, `agilecrm`, `apollo`, `apptivo`, `barantum`, `boondmanager`, `brevo`, `cas-genesisworld`, `catalyst`, `centralstationcrm`, `churnzero`, `clarify`, `clientify`, `close`, `cloze`, `cobra-crm`, `copper`, `corefactors`, `corporatestack`, `crelate`, `crm-com`, `deskera`, `dex`, `dolibarr`, `efficy`, `engagebay`, `espocrm`, `eudonet`, `folk`, `follow-up-boss`, `forcemanager`, `frappe-crm`, `freshsales`, `gainsight`, `gallabox`, `gold-vision`, `holded`, `insightly`, `jobdiva`, `kapture-crm`, `kintone`, `klenty`, `krayin-crm`, `kylas`, `lacrm`, `leadsquared`, `lemlist`, `lime-crm`, `loxo`, `manatal`, `maximizer`, `mazrica`, `megaplan`, `membrain`, `method-crm`, `mixmax`, `moskit`, `nethunt-crm`, `nocrm-io`, `nutshell`, `odoo-crm`, `onepagecrm`, `ontraport`, `ortto`, `pipeline-crm`, `pipeliner`, `planhat`, `ploomes`, `qiscus`, `qontak`, `ragic`, `raynet`, `recruit-crm`, `recruiterflow`, `reply-io`, `respond-io`, `retailcrm`, `rex-crm`, `sage-crm`, `salesflare`, `salesmanago`, `salesmate`, `salesnexus`, `samdock`, `sansan`, `sap-sales-cloud`, `scoro`, `simplicate`, `solve-crm`, `streak`, `sugarcrm`, `teamgate`, `teamwave`, `teamwork-crm`, `totango`, `tribe-crm`, `twenty`, `upsales`, `vitally`, `vtiger`, `wakeupsales`, `wati`, `weclapp`, `workbooks`, `yetiforce`

### ecommerce

`aimeos`, `ankorstore`, `bagisto`, `bagy`, `bettercommerce`, `bigcartel`, `brink-commerce`, `bumpa`, `buymeacoffee`, `cartpanda`, `centra`, `coupang`, `crystallize`, `cscart`, `dooca-commerce`, `drupal-commerce`, `dukaan`, `ecwid`, `evershop`, `falabella`, `fastspring`, `fnac-marketplace`, `gambio`, `gmarket`, `godaddy-websites-commerce`, `gofrugal`, `hepsiburada`, `idosell`, `ikas`, `insales`, `ionos`, `izberg`, `jtl-shop`, `kaufland-marketplace`, `kofi`, `korona-pos`, `lemon-squeezy`, `logicommerce`, `loja-integrada`, `magento`, `manomano`, `marketplacer`, `medusa`, `mirakl`, `mycashflow`, `nacelle`, `newegg`, `nopcommerce`, `nuorder`, `opencart`, `optimizely-configured-commerce`, `orderchamp`, `ordergroove`, `ozon`, `payhip`, `pepperi`, `petpooja`, `pinduoduo`, `prestashop`, `quickbutik`, `rakuten`, `recharge`, `saleor`, `sana-commerce`, `sapo`, `scayle`, `sendowl`, `shift4shop`, `shogun`, `shopaccino`, `shuup`, `skio`, `snipcart`, `squarespace`, `starweb`, `stay-ai`, `storehippo`, `swell`, `sylius`, `temu`, `thirty-bees`, `trendyol`, `vendure`, `virto-commerce`, `virtuemart`, `vnda`, `vtex`, `wayfair`, `wbuy`, `wildberries`, `woocommerce`, `xcart`, `xt-commerce`, `yampi`, `yokart`

### logistics

`123loadboard`, `17track`, `aftership`, `andreani`, `apc-overnight`, `aramex`, `aramex-au`, `aramex-me`, `arcbest`, `asendia`, `averitt`, `aymakan`, `azul-cargo`, `bluedart`, `borzo`, `bosta`, `boxberry`, `bpost`, `bring`, `bringg`, `brt`, `canada-post`, `canpar`, `cargus`, `cdek`, `central-transport`, `chazki`, `chronopost`, `cigo-tracker`, `circuit`, `cjlogistics`, `clickpost`, `cma-cgm`, `colissimo`, `correios`, `correo-argentino`, `couriers-please`, `ctt`, `cubbo`, `curri`, `da-vinci-unified`, `dayton-freight`, `delhivery`, `deliveree`, `deposco`, `descartes`, `dhl-ecommerce`, `dhl-freight`, `dhl-global-forwarding`, `dhl-parcel-bnl`, `dispatchtrack`, `dpd-local-uk`, `dropoff`, `dtdc`, `easypost`, `ekart`, `elogii`, `envia`, `enviaya`, `eshipz`, `estafeta`, `estes`, `ets-express`, `evri`, `fastway-africa`, `fetchr`, `flash-express`, `flowspace`, `forward-air`, `fourkites`, `fourpx`, `freightify`, `freightos`, `frenet`, `gd-express`, `geodis`, `ghn`, `ghtk`, `gig-logistics`, `globegistics`, `glovo`, `gls`, `gls-de`, `gocomet`, `gophr`, `gophr-uk`, `goshare`, `hapag-lloyd`, `hermes-de`, `hongkong-post`, `imile`, `infoplus`, `innoship`, `inpost`, `intelipost`, `ithink-logistics`, `jadlog`, `janio`, `japan-post`, `jeebly`, `jne`, `jt-express`, `karrio`, `kerry-express`, `kitchenhub`, `kobo360`, `korea-post`, `lalamove`, `lasership`, `leopards`, `limeexpress`, `locus`, `loggi`, `loginext`, `loop-returns`, `macropoint`, `magaya`, `metapack`, `mondialrelay`, `mothership`, `mylerz`, `naqel`, `narvar`, `nash`, `nationex`, `networkon`, `nextbillion-ai`, `nimbuspost`, `nova-poshta`, `nshift`, `oca`, `omniva`, `one-line`, `onfleet`, `onro`, `ontrac`, `optimoroute`, `outvio`, `packeta`, `packlink-pro`, `pandago`, `parcelforce`, `parcelhub`, `parcellab`, `pickrr`, `pirateship`, `pitt-ohio`, `pochta-russia`, `portcast`, `post-dk`, `posta-ke`, `posti`, `postnl`, `postnord`, `ppl-cz`, `purolator`, `quadient`, `returngo`, `rl-carriers`, `roadie`, `roambee`, `route4me`, `routific`, `rplust`, `sagawa`, `saia`, `sameday`, `samsara`, `searates`, `seavantage`, `sefl`, `sendcloud`, `sendle`, `sendparcel`, `senpex`, `servientrega`, `sf-express`, `ship24`, `shipbubble`, `shipcloud`, `shipday`, `shipengine`, `shipium`, `shipkaro`, `shipmondo`, `shipmonk`, `shipmozo`, `shipperhq`, `shippify`, `shippo`, `shippypro`, `shipsgo`, `shipstation`, `shipsy`, `shiptheory`, `shiptime`, `shipway`, `shipwire`, `shyplite`, `sicepat`, `sinay`, `singapore-post`, `skydropx`, `skynet`, `smc3`, `smsa`, `southeastern-freight`, `spee-dee`, `stamps`, `starken`, `starshipit`, `startrack`, `sto-express`, `tcs-express`, `tcs-pk`, `terminal-africa`, `terminal49`, `tive`, `tnt`, `toll-group`, `tookan`, `topship`, `total-express`, `track-pod`, `trackingmore`, `tradlinx`, `transportify`, `unified-to-shipping`, `usps`, `vamaship`, `veho`, `venipak`, `veracore`, `vizion`, `vizion-api`, `wakeo`, `ward-trucking`, `warp`, `webcargo`, `wise-systems`, `wonderment`, `xpressbees`, `yamato`, `yodel`, `yto-express`, `zim`, `zto-express`

### docsign

`a-trust`, `annature`, `anvil`, `assently`, `autentique`, `blueink`, `blueink-bypass`, `boldsign`, `breezedoc`, `certinal`, `clicksign`, `cloudsign`, `comsigntrust`, `concord`, `contractworks`, `d4sign`, `digio`, `digisigner`, `docspring`, `documenso`, `docuseal`, `dokobit`, `e-signature-eu`, `eideasy`, `emsigner`, `esignglobal`, `esignly`, `eversign`, `evrotrust`, `flowmono`, `foxit-esign`, `fp-sign`, `fpt-econtract`, `gmo-sign`, `infocert`, `inkit`, `insign`, `jotform-sign`, `jsign`, `juro`, `lealos`, `leegality`, `legaldesk`, `legalesign`, `lex-persona`, `libresign`, `linksquares`, `lleida-net`, `lumin-sign`, `luxtrust`, `mekari-sign`, `mifiel`, `modusign`, `namirial`, `nitro-sign`, `odoo-sign`, `onespan-sign`, `opensign`, `penneo`, `privyid`, `proof`, `sertifi`, `sign-plus`, `signable`, `signatureapi`, `signaturely`, `signaturit`, `signdesk`, `signhost`, `signiflow`, `signority`, `signrequest`, `signwell`, `signzy`, `sirion`, `sproof-sign`, `stepover`, `swisssign`, `tilaka`, `universign`, `validated-id`, `visma-sign`, `webdox`, `xodo-sign`, `yoti-sign`, `zefort`, `zorrosign`

### projects

`activecollab`, `artia`, `baserow`, `bigtime`, `birdview`, `businessmap`, `coda`, `factro`, `favro`, `fibery`, `fieldwire`, `float`, `freedcamp`, `ganttpro`, `goodday`, `huly`, `hygger`, `kaiten`, `kanbanize`, `kanboard`, `leantime`, `mantisbt`, `meisterplan`, `nextcloud-deck`, `nocodb`, `nuclino`, `nutcache`, `odoo-project`, `ora`, `paymo`, `perdoo`, `pivotal-tracker`, `planfix`, `planview-adaptivework`, `process-street`, `productplan`, `projectmanager`, `proofhub`, `quickbase`, `redmine`, `rocketlane`, `ruddr`, `runrun-it`, `scoro`, `seatable`, `shortcut`, `smartsuite`, `smarttask`, `stackby`, `taiga`, `tapd`, `targetprocess`, `teamhood`, `teamwork-desk`, `toggl-plan`, `trello`, `tuleap`, `twproject`, `vikunja`, `weeek`, `wekan`, `zenhub`

### customer-support

`ada-cx`, `channel-talk`, `chaport`, `chaskiq`, `chatbot-knowmax`, `chatwoot`, `clearfeed`, `cognigy`, `comm100`, `connectwise-psa`, `crisp`, `customerly`, `delightchat`, `deskcom-desk365`, `deskpro`, `document360`, `drift`, `edesk`, `faveo-helpdesk`, `five9`, `forethought`, `frappe-helpdesk`, `freescout`, `freshchat`, `freshdesk`, `freshservice`, `front`, `gallabox`, `gist`, `gladly`, `gorgias`, `gorgias-aircall`, `groove`, `happyfox`, `haptik`, `helpcenter-io`, `helpcrunch`, `helpcrunch-na`, `helpjuice`, `helpshift`, `helpspot`, `helpwise`, `jitbit-helpdesk`, `kayako`, `khoros-care`, `kore-ai`, `kustomer`, `libredesk`, `liveagent`, `livechat`, `livehelpnow`, `missive`, `mojo-helpdesk`, `movidesk`, `octadesk`, `odoo-helpdesk`, `olark`, `omnidesk`, `osticket`, `otobo`, `papercups`, `plain`, `proprofs-help-desk`, `pyrus`, `rasayel`, `reamaze`, `reply-bird-conversations`, `respond-io`, `richpanel`, `smartsupp`, `snapengage`, `supportbench`, `sysaid`, `take-blip`, `tawk-to`, `teamsupport`, `thena`, `tidio`, `tiledesk`, `trengo`, `unthread`, `usedesk`, `userlike`, `uvdesk`, `verloop`, `vivantio`, `wati`, `yellow-ai`, `zammad`, `zenvia`, `znuny`

### inventory

`3plcentral`, `acctivate`, `advance-pro`, `agiliron`, `apicbase`, `asset-panda`, `billbee`, `booqable`, `boxstorm`, `camelot-3pl`, `cheqroom`, `cin7-core`, `cin7-omni`, `connectpos`, `crunchtime`, `da-vinci-unified`, `datapel`, `deck-commerce`, `deposco`, `easyecom`, `eccang`, `erpag`, `erplain`, `erply`, `extensiv-inventory`, `ezofficeinventory`, `finale-inventory`, `fishbowl`, `fluent-commerce`, `fulfil-io`, `gocodes`, `gofrugal`, `increff`, `inflow`, `infor-wms`, `inventory-planner`, `inventree`, `iqmetrix`, `itemit`, `jubelio`, `jushuitan`, `katana`, `kladana`, `korona-pos`, `listing-mirror`, `mabang-erp`, `manhattan-active`, `marketman`, `megaventory`, `mintsoft`, `mrpeasy`, `netstock`, `odoo-inventory`, `ongoing-wms`, `openboxes`, `openbravo`, `orca-scan`, `orderbot`, `orderful`, `peoplevox`, `pickware`, `picqer`, `pipe17`, `prediko`, `pulpo-wms`, `qoblex`, `restaurant365`, `sage-x3-inventory`, `sellbrite`, `sellercloud`, `shelf-nu`, `shipedge`, `skulabs`, `skunexus`, `skusavvy`, `skuvault`, `snipe-it`, `sortly`, `spherewms`, `stocktrim`, `store-feeder`, `sumtracker`, `supy`, `syspro`, `texada`, `unicommerce`, `unleashed`, `vario-software`, `veeqo`, `versa-cloud-erp`, `vhsys`, `wasp-barcode`, `webgility`, `xentral`

