# Local HTTPS for OAuth callbacks

Some OAuth providers refuse an `http://` redirect URI, even on `localhost`.
The `https` compose profile puts Caddy in front of integration-server at
<https://localhost>, signed by Caddy's own local CA. You don't need a domain,
Let's Encrypt, or any inbound access to your machine. The OAuth callback is a
browser redirect, so the provider never connects to it.

Adapters that work on `http://localhost:3010` today keep working as they are.
Only the adapters whose provider needs https get an https Redirect URI.

## 1. Start the profile

```bash
docker compose --profile https up -d
```

Or put `COMPOSE_PROFILES=https` in `.env` to have every compose command
include it. The profile adds one container, `caddy`, which publishes
`127.0.0.1:443` (loopback only) and proxies everything to
`integration-server:3010`. Config: [`deploy/local-https/Caddyfile`](../../deploy/local-https/Caddyfile).

## 2. Trust the local CA (once)

```bash
scripts/trust-local-https-ca.sh
```

The script copies Caddy's root certificate out of the container and adds it to
the system trust store: the macOS System keychain (you'll be asked for sudo),
`update-ca-certificates` on Debian/Ubuntu, or `trust anchor` on Fedora/Arch.
It does nothing if the CA is already trusted. Firefox and Linux browsers can
keep their own store; the script prints what to do if they still warn.

Check it:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://localhost/health   # 200, no -k
```

The CA lives in the `caddy-data` volume. If you remove that volume, Caddy
creates a new CA, and you need to run the script again.

> **Security:** anyone who has the CA key (the `caddy-data` volume) can mint
> certificates this machine will accept for _any_ hostname. Use the profile
> only on dev machines, and run `scripts/trust-local-https-ca.sh --remove`
> when you're done with it.

## 3. Point the adapter at https

For each platform whose provider needs https:

1. In the admin console, open the platform under **Platforms** and set **Redirect URI** to
   `https://localhost/auth/{vertical}/{platform}/callback`.
2. Register the same URL in the provider's developer console. Most providers
   accept several redirect URIs, so you can keep an http entry next to it
   while you migrate.

Leave every other adapter alone. `PUBLIC_BASE_URL` stays
`http://localhost:3010`, so Connect Links are still served over http. After
the https callback, the customer lands back on
`http://localhost:3010/connect/<token>/done` as before. `TRUST_PROXY` is not
needed either, because `PUBLIC_BASE_URL` is pinned.

## Why http and https adapters can coexist

The token exchange repeats the `redirect_uri` that the adapter's authorize URL
actually sent, as RFC 6749 §4.1.3 requires. That value comes from the
adapter's own Redirect URI field. The URI derived from `PUBLIC_BASE_URL` is
used only when an authorize URL carries none. So the scheme is chosen per
adapter, and both callback origins reach the same `/auth/{vertical}/{platform}/callback`
route. See the OAuth sequence in
[architecture/runtime-flows.md](../architecture/runtime-flows.md).

## When this is not enough

- **Port 443 is taken.** Publish another host port in
  `docker-compose.override.yml`:
  ```yaml
  services:
    caddy:
      ports: !override
        - '127.0.0.1:8443:443'
  ```
  Then use `https://localhost:8443/auth/…/callback` as the Redirect URI.
  Some providers reject a URI that includes a port.
- **The provider rejects `localhost` altogether**, or insists on a public
  domain. Use a tunnel (Cloudflare Tunnel, ngrok) with a real hostname and
  certificate, then follow [deployment/custom-domain.md](../deployment/custom-domain.md).
- **Inbound webhooks.** These are server-to-server, so the provider does have
  to reach you. A tunnel is the only local option here too.

## Stop

```bash
docker compose --profile https stop caddy
scripts/trust-local-https-ca.sh --remove     # if you won't need it again
```
