# OpenSteward trademark policy

The [`LICENSE`](./LICENSE) covers the *code*. It does not give you rights to the
*name*. This page explains what you can and can't do with "OpenSteward" and the
project's branding.

The Elastic License 2.0 says only that "any use of the licensor's trademarks is
subject to applicable law," which is thinner than the explicit reservation in
Apache-2.0 §6. So the position is stated here instead.

## The marks

- The name **OpenSteward** (and **Open Steward**).
- The OpenSteward logo and wordmark, including the assets in [`brand/`](./brand/).
- The `opensteward` and `@opensteward` npm names and the `open-steward` GitHub
  organisation.

These are claimed by Falco Consulting AB. They are not licensed to you by the
[`LICENSE`](./LICENSE), by [`NOTICE`](./NOTICE), or by contributing.

## What you can do without asking

- **Say what your software is.** "Built on OpenSteward," "compatible with
  OpenSteward," "OpenSteward adapter for Acme," "we self-host OpenSteward."
  Accurate, factual references to the project are fine — this is nominative
  use and no licence is needed for it.
- **Keep the name where it already is.** Running, forking, or redistributing
  OpenSteward with its branding intact needs no permission.
- **Write about it.** Blog posts, talks, comparisons, tutorials, and reviews —
  including critical ones — are all fine.
- **Use the logo to refer to the project**, unmodified, at a sensible size, in
  documentation, slides, or an integrations page.

## What needs permission

- **Naming your product after it.** Product, company, service, or domain names
  built on the mark — "OpenSteward Cloud," "OpenSteward Pro," "Hosted
  OpenSteward," `opensteward-*.com` — need written permission, whether or not
  the underlying use of the code is permitted.
- **Distributing a modified build under the name.** If you change the software
  and hand it to others, either drop the branding or get permission. This is
  the ordinary rule that a mark should identify one source; it also lines up
  with the Elastic License 2.0's requirement that modified copies carry
  prominent notices of modification.
- **Implying endorsement.** Anything suggesting the project sponsors, certifies,
  approves, or partners with you.
- **Registering the mark, or anything close to it,** as a trademark, company
  name, or domain, anywhere.

## Removing the branding

OpenSteward ships a white-label option (`hideAttribution`) that suppresses
OpenSteward branding across the admin, docs, and Connect surfaces. **Using it as
shipped is permitted** — it's a supported feature, and it's the right thing to
use when OpenSteward is a component of your product rather than the product
itself.

Two limits apply:

- The white-label option covers *product branding*. It does not extend to
  removing or obscuring the copyright and licence notices in the source, which
  the Elastic License 2.0 separately requires you to keep.
- Removing the branding does not transfer the mark. A white-labelled deployment
  is unbranded; it does not become yours to name.

## Forks

Fork freely — that right is in the licence and this page doesn't touch it. Just
give the fork its own name, so nobody downloading it thinks they're getting the
upstream project. Saying "a fork of OpenSteward" in your README is exactly the
sort of accurate reference the section above permits.

## Other companies' trademarks

OpenSteward integrates with 1,548 third-party platforms and names them
throughout the catalog, the docs, and the adapter tree. Those names and logos
belong to their respective owners. OpenSteward claims no rights in them, is
not affiliated with or endorsed by any of them, and uses them only to identify
which platforms an integration supports — ordinary nominative use.

This is also why **no platform logos ship with OpenSteward**. Redistributing
1,474 other companies' marks inside a repository and five container images is
a different act from displaying them, and Brandfetch's Logo API terms
separately prohibit caching their CDN without an agreement. Operators opt in
to logos on their own account instead — see
[`docs/operations/platform-logos.md`](./docs/operations/platform-logos.md) and
[`THIRD-PARTY-NOTICES.md`](./THIRD-PARTY-NOTICES.md).

## Asking

Email **support@opensteward.dev**. Most reasonable requests are granted,
and it's usually a quick answer. If you're unsure whether what you're planning
needs permission, asking costs nothing.
