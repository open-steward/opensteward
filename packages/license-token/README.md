# @opensteward/license-token

The license token contract shared by OpenSteward and the OpenSteward license service.

- **OpenSteward** verifies license tokens offline, with no network call, using `verifyLicense`.
- **The license service** builds the exact bytes to sign with `buildSigningInput`, signs them
  with AWS KMS, and assembles the token with `assembleToken`.

Tokens are [PASETO v4.public](https://github.com/paseto-standard/paseto-spec) (Ed25519). The
only runtime dependency is `zod` 4; there are no other dependencies. CommonJS, with named ESM
imports supported. Node.js ≥ 22 (tested on 24).

Licensed under the Elastic License 2.0 (see `LICENSE`). This package is license key
functionality in the sense of that license.

**Status:** release candidate `1.0.0-rc.1`. Release candidates go to the `next` dist-tag; `1.0.0`
goes to `latest` once a real production license, signed by the license service's production AWS KMS
key, has verified with this package.

## Token format

```
v4.public.<base64url(payload || signature)>.<base64url({"kid":"k2026a"})>
```

- **Header:** `PASETO_HEADER` (`v4.public.`). Anything else is refused.
- **Footer:** exactly `{"kid":"…"}` (`FooterSchema`), with the kid matching `KID_PATTERN`
  (`^[a-z0-9]{1,16}$`), at most `MAX_FOOTER_BYTES` (256) bytes. The footer is signed, not
  encrypted. It selects the public key.
- **Implicit assertion** (signed, never carried): `LICENSE_ASSERTION`
  (`opensteward-license-v1`) for licenses and `REVOCATIONS_ASSERTION`
  (`opensteward-revocations-v1`) for revocation lists. A token made for one purpose never
  verifies as the other.
- **Size:** the signing input is at most `MAX_SIGNING_INPUT_BYTES` (4096), the token at most
  `MAX_TOKEN_LENGTH` (6144) characters.

### Payload (`LicensePayload`, validated by `LicensePayloadSchema`)

```json
{
  "iss": "opensteward.dev",
  "aud": "opensteward",
  "sub": "lic_8f3k2abc",
  "org": "Acme Försäkring AB",
  "tier": "free",
  "features": ["mcp", "vertical:accounting", "vertical:crm", "vertical:payments"],
  "limits": { "connections": 5, "tenants": 1 },
  "label": "production",
  "env": "prod",
  "iat": "2026-10-06T17:00:00Z",
  "nbf": "2026-10-06T17:00:00Z",
  "exp": "2027-10-06T17:00:00Z",
  "ver": 1
}
```

| Claim | Rule |
|---|---|
| top level | Strict: an unknown claim makes the token invalid. |
| `iss`, `aud` | Exactly `LICENSE_ISSUER` (`opensteward.dev`) and `LICENSE_AUDIENCE` (`opensteward`). |
| `sub` | The license ID, `SUB_PATTERN` (`lic_` + 6–64 letters or digits). |
| `org` | 1–200 characters. No control, format, line or paragraph separator, lone surrogate or private-use characters, and no leading or trailing whitespace. |
| `tier` | Any lower-case slug matching `TIER_PATTERN` (`^[a-z][a-z0-9_-]{0,31}$`). Display only: the product never gates on it. |
| `features` | Strings matching `FEATURE_PATTERN`, each at most `MAX_FEATURE_LENGTH` (64), at most `MAX_FEATURES` (128). Duplicates are dropped. Unknown well-formed features verify and the product ignores them. |
| `limits` | Must hold `LIMIT_KEYS` (`connections`, `tenants`) as non-negative safe integers. Extra keys matching `LIMIT_KEY_PATTERN` are allowed (at most `MAX_LIMIT_KEYS`, 16 keys in all) and ignored by products that do not know them. |
| `label` | Optional, 1–64 characters, same character rules as `org`. Tells an org's installs apart. |
| `env` | Any lower-case slug matching `ENV_PATTERN`. The product treats only `"dev"` specially. |
| `iat`, `nbf`, `exp` | RFC 3339 UTC with an upper-case `T` and `Z` and seconds (`toClaimTime` produces it). `nbf` and `iat` must not be after `exp`. |
| `ver` | Exactly `FORMAT_VERSION` (1). Any other value is invalid. |

`limits.tenants` counts the tenants registered in OpenSteward's admin API, including the
always-present `default` tenant. There is no `workspaces` key.

No personal data goes into a token: no email addresses and no names of people. The org name
and the license ID are the only identifiers.

## Issuing a license with AWS KMS

The KMS key has key spec `ECC_NIST_EDWARDS25519`. Sign the raw signing input with
`MessageType: 'RAW'` and `SigningAlgorithm: 'ED25519_SHA_512'`. **Never** use
`ED25519_PH_SHA_512` or `MessageType: 'DIGEST'`: pre-hashed Ed25519 signatures do not verify.

```ts
import { SignCommand } from '@aws-sdk/client-kms' // kms below is a KMSClient
import { assembleToken, buildSigningInput, verifyLicense } from '@opensteward/license-token'

const footer = { kid: 'k2026a' }
// ZodError if the payload is invalid, RangeError above MAX_SIGNING_INPUT_BYTES (4096).
const message = buildSigningInput(payload, footer)
const { Signature } = await kms.send(
  new SignCommand({
    KeyId: K2026A_KMS_KEY_ID,
    Message: message,
    MessageType: 'RAW',
    SigningAlgorithm: 'ED25519_SHA_512',
  }),
)
const token = assembleToken(payload, footer, Signature!) // requires a 64-byte signature
const check = verifyLicense(token, { k2026a: K2026A_PUBLIC_KEY }, new Date())
if (!check.ok) throw new Error(`refusing to deliver a token that does not verify: ${check.reason}`)
```

`buildSigningInput` and `assembleToken` serialize the payload the same way
(`canonicalPayloadBytes`: schema-validated, keys sorted at every level), so the signed bytes and
the assembled bytes always match.

### What the service must do before calling `buildSigningInput`

The schema is deliberately lenient where leniency keeps old installs working. The service is
the strict side:

- **Validate what it issues.** Check every feature with `isKnownFeature` (against
  `KNOWN_FEATURES`), the tier with `isKnownTier` (against `KNOWN_TIERS`) and the env with
  `isKnownEnv` (against `KNOWN_ENVS`). The schema accepts any well-formed value so that a new
  feature, tier or env never makes tokens INVALID on installs that predate it.
- **Normalize display text.** `org` and `label` are refused (a ZodError) with leading or
  trailing whitespace, or with control, format, line or paragraph separator, lone surrogate or
  private-use characters. Trim Stripe customer names and strip those characters first.
- **No "unlimited" sentinel.** Every limit is a non-negative safe integer. For "unlimited",
  use `UNLIMITED_FROM` (`1_000_000`) or more: the product and the service both show such a limit
  as "Unlimited" (`isUnlimitedLimit`), and enforcement still compares the number.
- **Keep `sub` short and fixed-length.** Its length decides how many IDs fit in a revocation
  list (below). Recommended: `lic_` plus 16 letters or digits (20 characters).
- **Use whole-second times** from `toClaimTime(date)`.

## Public keys

A `KeyMap` maps a kid to the base64url (no padding) raw 32-byte Ed25519 public key.

- `publicKeyFromSpkiDer(der)` converts KMS `GetPublicKey` output (SPKI DER) into a key map
  entry.
- `importPublicKey(value)` turns an entry into a Node `KeyObject`. It throws a `TypeError` for
  anything but 32 real key bytes, so a placeholder or a zeroed entry reports `BAD_KEY` at
  verification time.

Every kid OpenSteward trusts comes from KMS output, through a pull request to the OpenSteward
repository.

## Revocation lists

A revocation list is a token with the `RevocationPayload` shape, validated by
`RevocationPayloadSchema`:

```json
{ "ver": 1, "iat": "2026-10-09T00:00:00Z", "revoked": ["lic_…"] }
```

Sign it with `buildSigningInput(list, footer, 'revocations')` and
`assembleToken(list, footer, signature, 'revocations')`. Verify it with
`verifyRevocationList(token, keyMap)`. `revoked` holds at most `MAX_REVOKED` (256) IDs;
duplicates are dropped.

**Capacity.** The 4096-byte KMS limit usually binds before `MAX_REVOKED`. The signing input of a
list is:

```
76 (PAE framing 40 + header 10 + assertion 26)
+ footer (10 + len(kid))
+ 51 (the list's JSON with no IDs and a whole-second iat)
+ n × (len(sub) + 3) − 1
```

So one list holds `floor((4096 − 76 − (10 + len(kid)) − 51 + 1) / (len(sub) + 3))` IDs. With a
6-character kid that is `floor(3954 / (len(sub) + 3))`: 55 IDs at the longest `sub` (68
characters), 171 at the recommended 20.

## Verifying

```ts
const result = verifyLicense(token, keyMap, now)
if (result.ok) {
  result.payload // LicensePayload
  result.kid
} else {
  result.reason // VerifyFailureReason
}
```

`verifyLicense(token, keyMap, now)` returns a `LicenseVerification`, and
`verifyRevocationList(token, keyMap)` a `RevocationVerification`. Neither ever throws: every
problem is a `VerifyFailure` with a `reason` and sometimes a `detail`. A `detail` holds field
paths and error codes, a kid or a claim time, never token text.

| `VerifyFailureReason` | Meaning |
|---|---|
| `TOO_LARGE` | Longer than `MAX_TOKEN_LENGTH`. Refused before parsing. |
| `NOT_PASETO_V4_PUBLIC` | Not `v4.public.` (another PASETO version or purpose, a JWT, empty). |
| `MALFORMED` | Bad base64url, padding, extra segments, too short, not a string, or `now` is not a valid Date. |
| `FOOTER_INVALID` | Missing, larger than `MAX_FOOTER_BYTES`, not JSON, or not exactly `{"kid"}`. |
| `UNKNOWN_KID` | The kid is not in the key map. |
| `BAD_KEY` | The key map entry is not a usable public key (e.g. a placeholder). |
| `BAD_SIGNATURE` | The signature does not verify, including a token made for the other purpose. |
| `PAYLOAD_NOT_JSON` | The signed payload is not UTF-8 JSON. |
| `UNSUPPORTED_VERSION` | `ver` is not `FORMAT_VERSION`. Checked before the schema. |
| `WRONG_ISSUER` / `WRONG_AUDIENCE` | `iss` or `aud` differ. |
| `PAYLOAD_INVALID` | The payload breaks the schema (for example an unknown claim). |
| `NOT_YET_VALID` | `now` is more than `NBF_SKEW_MS` (5 minutes) before `nbf`. |

### What callers must do

`verifyLicense` checks the token, not the license's time state. The caller:

1. **Trims** the token text first. A trailing newline from a file is `MALFORMED`.
2. **Passes a rollback-protected `now`**, not the raw system clock.
3. **Classifies `exp` itself.** An expired but authentic token is `ok: true`, so the product
   can run a grace period after expiry.
4. **Maps `NOT_YET_VALID` to an invalid license.**
5. **Checks revocation:** a license is revoked when a verified revocation list's `revoked`
   includes its `sub`. The caller also decides which kids may sign revocation lists.

## Vocabulary

- `VERTICALS` and the `Vertical` type: the nine product verticals.
- `verticalFeature(v)` gives the `VerticalFeature` `vertical:<v>`.
- `KNOWN_FEATURES` and the `KnownFeature` type: `mcp`, `vertical:<each vertical>`, `sso` and
  `audit_export`. `isKnownFeature(f)` tests membership.
- `KNOWN_TIERS` (`free`, `pro`, `enterprise`) with the `KnownTier` type and `isKnownTier`, and
  `KNOWN_ENVS` (`prod`, `dev`) with the `KnownEnv` type and `isKnownEnv`.
- `LIMIT_KEYS` and the `LimitKey` type.
- `UNLIMITED_FROM` (`1_000_000`) and `isUnlimitedLimit(n)`: display only. A limit at or above it
  is shown as "Unlimited"; the token still carries the number.
- `TokenPurpose`: `'license'` or `'revocations'`.

## Low-level building blocks

These are exported for tooling and conformance tests; issuing and verifying need none of them.

- `pae(pieces)`: PASETO pre-authentication encoding.
- `encodeBase64Url(bytes)` and `decodeBase64UrlStrict(text)`: unpadded base64url. The strict
  decoder returns `null` for padding, characters outside the alphabet, or non-zero trailing
  bits, all of which Node's own decoder accepts.
- `canonicalPayloadBytes(payload, purpose)`: the exact payload bytes that get signed.
- `LicensePayloadSchema`, `FooterSchema` and the `Footer` type, `RevocationPayloadSchema`.

## Changing the contract

Changes are coordinated between the two repositories: change this package, publish it, then
update the license service. A new feature, tier, env or limit key needs no format change,
because older products accept and ignore well-formed values they do not know. Anything else
(a new claim, a different meaning) needs a new `FORMAT_VERSION`, which older products refuse.

## Development keys

The `dev1` key pair exists only in the OpenSteward repository (`fixtures/dev1.json` and
`pnpm license:dev-token`). It is not in this package. `devk1` is the license service's
development-account KMS key. Production builds of OpenSteward trust neither.

## Conformance

The PAE, base64url and v4.public framing are pinned by the official
[PASETO v4 test vectors](https://github.com/paseto-standard/test-vectors): re-signing 4-S-1 to
4-S-3 with `node:crypto` reproduces each token byte for byte, and 4-F-1 to 4-F-5 are refused.
