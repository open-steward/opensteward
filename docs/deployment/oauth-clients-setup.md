# Setting up OIDC bearer tokens for the developer API

This guide walks an operator through letting developers authenticate to the
unified API (`/v1/*`) with a short-lived **OIDC bearer token** from an identity
provider you already run, instead of a static `osk_` API key. It covers
registering an issuer, deciding where authority comes from, registering service
accounts, and — once it works — retiring API keys.

- Developer-facing reference: [`../dev-api.md` §2](../dev-api.md#2-authentication)
- Scope vocabulary (shared with API keys): [`../dev-api.md` §3](../dev-api.md#3-scopes)
- SDK usage: [`../sdk/getting-started.md`](../sdk/getting-started.md)

> Configure at **Admin → OAuth clients** (`/oauth-clients`). Reading the page is
> **operator**-role or higher; every change is **admin**-only and audited.

**This is not the same feature as [SSO](./sso-setup.md).** That one decides how
*your staff* log into the admin console. This one decides how *a developer's
application* authenticates to the API. Both talk about "identity providers" and
both name Keycloak, Auth0, Okta and Entra ID, so it is worth being sure which
one you are configuring — they are separate pages, separate tables and separate
settings.

## 1. Before you start

**There is nothing to add to your `.env`.** OpenSteward is only a *resource
server* here: it verifies tokens using the issuer's published public keys. It
never mints a token, and there is no client secret of yours for it to store. If
a step ever asks you for one, you are on the wrong page.

Two things do have to be true:

| Requirement | Detail |
|---|---|
| The issuer is reachable **from integration-server** | It fetches the discovery document and the JWKS itself. Egress from that container to your IdP has to work. |
| The issuer URL is `https` | Plain `http` is refused: anyone on the path could swap the discovery document, and with it the signing keys. For a local IdP container during evaluation, set `OST_ALLOW_PRIVATE_HOSTS=1` on integration-server — **development only**. |

Optionally, `AUTH_DEV_OAUTH_ENABLED=1` on integration-server turns the feature
on from first boot, before anyone has opened the admin UI. It is only a default;
the `auth.dev_oauth_enabled` setting below overrides it and is read per request.

## 2. Register the issuer

**Admin → OAuth clients → Register issuer.**

1. Give it a **name** — it appears in the list and in the audit log.
2. Pick your **vendor** from the dropdown. This only fills in the claim names
   below; the verifier itself is identical for every issuer.
3. Paste the **issuer URL** and press **Test**. OpenSteward fetches
   `{issuer}/.well-known/openid-configuration`, checks that the document's own
   `issuer` matches what you typed, and fills in the **JWKS URI**. Nothing is
   saved yet.
4. Set the **audience**. See the warning below — this field is not optional.
5. Leave **Accept tokens from this issuer** ticked and save.

> **The audience is the field that matters.** It is the `aud` value a token must
> carry. Leave it blank or wrong and *every* token your IdP has ever minted, for
> any application — including ID tokens — would authenticate here. OpenSteward
> refuses to save an issuer without one, and the value has to match what your
> IdP actually puts in `aud`, not what you wish it would.

Only asymmetric signature algorithms are accepted (`RS*`, `PS*`, `ES*`,
`EdDSA`). `HS256` and `none` are refused however you fill the form in: with a
published JWKS, an HMAC algorithm lets anyone mint a token using the *public*
key as the secret.

### Keycloak

1. Create a **client** in your realm with **Client authentication** on and
   **Service accounts roles** enabled (this is the `client_credentials` grant).
2. **Add an audience mapper.** Client → Client scopes → *`<client>`-dedicated* →
   Add mapper → By configuration → **Audience**, and set *Included Custom
   Audience* to the audience you entered above. Without this the token's `aud`
   is just `account` and every request is refused — correctly, and with no clue
   as to why.
3. Assign the realm roles you want the token to carry, under Service accounts
   roles.
4. Issuer URL: `https://{host}/realms/{realm}`. Claims: subject `azp`, scopes
   `realm_access.roles`.

`realm_access.roles` also carries Keycloak's own bookkeeping roles —
`default-roles-{realm}`, `offline_access`, `uma_authorization`. Registry and
intersect modes ignore them. Token-decides mode would read them as scopes, which
is why that mode wants scope rules (§5) rather than passthrough.

### Auth0

1. Create an **API** in Auth0 and use its **Identifier** as the audience here.
2. Create a **Machine to Machine application** authorised against that API, and
   grant it the permissions you want.
3. Issuer URL: `https://{tenant}.auth0.com/` — **with the trailing slash**, as
   Auth0 reports it. Claims: subject `azp`, scopes `scope`.

### Okta

1. Create an **API Services** application (client credentials).
2. Use a **custom authorisation server**, and set the audience here to that
   server's configured audience.
3. Issuer URL: `https://{org}.okta.com/oauth2/{authorizationServerId}`. Claims:
   subject `cid`, scopes `scp`.

### Microsoft Entra ID

1. Register an application, add an **app role**, and grant it to the calling
   application. App-only tokens carry roles in `roles`.
2. Audience is the target application's Application ID URI.
3. Issuer URL: `https://login.microsoftonline.com/{tenantId}/v2.0`. Claims:
   subject `azp`, scopes `roles`.

> **The most common Entra failure.** A v1.0 token carries
> `iss: https://sts.windows.net/{tenantId}/` even when you configured the v2.0
> endpoint, and the issuer check is exact, so it is rejected. Either set
> `"accessTokenAcceptedVersion": 2` in the app manifest, or register the v1.0
> issuer instead.

### Any other provider

Pick **Generic OIDC**. Anything that publishes an OpenID discovery document
works. Set the subject and scope claims to whatever your provider actually
emits — decode one of its tokens and look, rather than guessing.

## 3. Decide where authority comes from

This is the most consequential choice on the form, and the one to make
deliberately. The token proves *who* is calling; this decides *what they may
do*.

| Mode | Tenant and scopes come from | Revoking access |
|---|---|---|
| **Registry** *(default)* | A service account you register here | **Immediate** — delete the row |
| **Registry, narrowed by the token** | The row is a ceiling; the token may ask for less | **Immediate** |
| **The token decides** | Claims in the token; nothing is registered here | **Only when the token expires** |

Registry and intersect consult the database on **every** request, so deleting a
service account cuts off a token the developer is already holding — exactly like
revoking an API key. Token-decides mode gives that up: a leaked token is live
until it expires, and your only lever is disabling the whole issuer.

Choose token-decides when your IdP is genuinely the system of record for who may
do what, and you accept that trade. Choose registry otherwise.

## 4. Grant access

### Registry and intersect modes

**Admin → OAuth clients → *your issuer* → Register service account.**

- **Subject** — the value your issuer puts in its subject claim (`azp`, `cid`,
  …) for that client. In Keycloak and Auth0 this is the client id; decode a real
  token if you are unsure.
- **Tenant** — which tenant the caller acts as.
- **Scopes** — the same vocabulary API keys use. See
  [`../dev-api.md` §3](../dev-api.md#3-scopes); the two-axis vertical model
  applies unchanged, so a caller needs `vertical:write` for any non-`GET` on
  `/v1/{vertical}/*`.

A token whose subject is not registered is refused. That is the point: adding a
client in your IdP does not by itself grant access to OpenSteward.

### Token-decides mode

Instead of service accounts, set:

- **Tenant claim** — which claim names the tenant. There is deliberately **no
  default**: the tenant now arrives inside the token, so which claim carries it
  has to be stated rather than guessed.
- **Allowed tenants** — the values this issuer may assert, one per line. An
  **empty list admits nobody**, never everybody. Check that the claim you chose
  is one your IdP controls and a client cannot set for itself.
- **Maximum token lifetime** — a token whose `exp - iat` exceeds this is
  refused. It is the only control you have over a credential that cannot be
  revoked; the default is 3600s.

## 5. Scope mapping (optional)

With **no rules**, the token's scope claim passes through verbatim — right when
your IdP already emits OpenSteward scope names like `vertical:accounting`.

Add a rule and the behaviour flips: only mapped values survive, and anything
unmapped is **dropped** rather than passed through. That is what lets you map
your own vocabulary (`read:ledger` → `vertical:accounting`) without a client
being able to smuggle a scope in by naming it directly.

## 6. Retiring API keys

Once tokens work, you can stop accepting `osk_` keys at **Admin → Settings**,
`auth.dev_api_keys_enabled = false`. Keys then answer
`403 API_KEYS_DISABLED`.

OpenSteward refuses the change with `409 AUTH_LOCKOUT_REFUSED` unless
`auth.dev_oauth_enabled` is on, an issuer is enabled and able to admit somebody,
and that issuer has **already verified a real token**. Registering an issuer is
not enough — present a token through it first. If integration-server cannot be
reached to confirm, the change is refused rather than allowed: an unproven setup
is treated as unproven.

Both settings are read per request, so a change applies within about a minute
without a redeploy. Turning keys **back on** is never blocked — that is the
recovery move, and it has to work precisely when OAuth is broken.

> **`X-Admin-Secret` is never gated by either setting.** It stays working with
> both developer credentials off, and it is how you get back into a deployment
> whose developer auth has been misconfigured.

## 7. Verify

1. Get a token from your IdP the way a developer would — for a service account,
   usually the `client_credentials` grant against its token endpoint.
2. Call a read endpoint:
   ```sh
   curl -H "Authorization: Bearer $TOKEN" \
     "$BASE/v1/accounting/contacts?connection_id=<uuid>"
   ```
   Expect `200`.
3. Try a write the token is not scoped for. Expect `403 INSUFFICIENT_SCOPE` —
   proof the shared scope engine governs it exactly as it governs a key.
4. Reload **Admin → OAuth clients**. The banner should now read that OIDC bearer
   auth is usable, and the issuer's *last verified* should be set.
5. In registry mode, revoke the service account and retry with the **same
   still-unexpired token**. Expect `401`. This is the property registry mode
   exists for.
6. Check **Admin → Audit log** for `oauth_issuer.create` and
   `oauth_client.create`.

## Troubleshooting

Every verification failure answers the same `401 UNAUTHENTICATED`, deliberately:
a more specific error would let anyone with a junk token enumerate your service
accounts. **The specific reason is in the integration-server logs** — that is
where to look, and it carries neither the token nor its claims.

- **`403 OAUTH_DISABLED`** — `auth.dev_oauth_enabled` is off, or no issuer is
  configured.
- **`403 API_KEYS_DISABLED`** — you turned keys off; the caller needs a token.
- **`401` on every request, issuer looks right** — nine times in ten this is the
  audience. Decode the token and compare `aud` to what you registered. On
  Keycloak, check the audience mapper exists.
- **`401` and the logs mention the issuer** — the `iss` in the token does not
  exactly equal what you registered. Trailing slashes count. On Entra, see the
  v1.0/v2.0 note in §2.
- **Discovery fails on save or Test** — integration-server cannot reach the
  issuer, the URL is `http`, or it resolves to a private address. The last two
  are refused on purpose; `OST_ALLOW_PRIVATE_HOSTS=1` relaxes it for local
  development only.
- **`401` for one client but not another** — that subject is not registered, or
  is revoked. Compare the token's subject claim against the row.
- **`403 INSUFFICIENT_SCOPE` you did not expect** — in intersect mode the token
  can only *narrow* the registered scopes; check both. In token-decides mode
  with rules configured, an unmapped claim value is dropped.
- **`409 AUTH_LOCKOUT_REFUSED`** — see §6; the message names which condition
  failed.

## Doing it from the CLI

Every step above is scriptable — useful for provisioning a deployment from
infrastructure-as-code:

```sh
os oauth-clients discover --issuer https://idp.example.com/realms/main
os oauth-clients create-issuer  # name, issuer, jwksUri, audience, claims, mode
os oauth-clients create-client <issuerId>
os oauth-clients create-scope-rule <issuerId>
os oauth-clients list-issuers
os oauth-clients readiness      # the same check §6 runs before letting you disable keys
```

Full flags: [`../operations/cli.md`](../operations/cli.md#os-oauth-clients).
