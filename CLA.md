# OpenSteward Contributor License Agreement

Thank you for contributing to OpenSteward.

Before your first pull request can be merged, you need to agree to this
Contributor License Agreement ("CLA"). It is short, and this section explains
what it does and why.

## Why this exists

OpenSteward is source-available: most of it is under the Elastic License 2.0
plus an Additional Use Grant (see [`LICENSE`](./LICENSE)), and some client
packages are under Apache-2.0.

Under a plain "inbound = outbound" rule, your contribution would arrive
licensed to the project under those same terms. That sounds fine, but it has a
consequence: the project could no longer sell a commercial license covering
your code, because it would not hold the rights to do so. One contributor's
patch would make a whole file unlicensable, and the project would slowly become
impossible to license coherently.

This CLA solves that by having you grant broad rights **in addition to**, not
instead of, the rights you already have.

## What you keep

**You keep the copyright to your contribution.** This is not a copyright
assignment. You can relicense your own contribution to anyone else, use it in
your own projects, and do anything else an owner can do. Nothing here takes
that away or makes it exclusive.

## What you grant

By submitting a contribution, you agree to the following.

### 1. Definitions

"You" means the copyright owner, or the legal entity authorised by the
copyright owner, that is entering into this agreement.

"Contribution" means any work of authorship you intentionally submit to the
project — code, documentation, configuration, or anything else — including any
modifications to existing work. "Submit" means any form of communication sent
to the project or its maintainers, including pull requests, issues, and
patches, other than communication clearly marked "Not a Contribution."

"Project" means the OpenSteward project. "We" and "us" mean Falco Consulting AB,
a Swedish limited company (corporate identity number 559484-4838), as the
project's owner and licensor, and any successor to that role.

### 2. Copyright licence

You grant us a perpetual, worldwide, non-exclusive, royalty-free, irrevocable
copyright licence to reproduce, prepare derivative works of, publicly display,
publicly perform, sublicense, and distribute your Contribution and such
derivative works.

**This licence includes the right to license your Contribution under any terms,
including the Elastic License 2.0, the Apache License 2.0, other open source
licences, and commercial or proprietary licences.** This is the clause that
makes it possible to sell commercial licences and to relicense the project in
future — including to a more permissive licence.

### 3. Patent licence

You grant us and every recipient of the software a perpetual, worldwide,
non-exclusive, royalty-free, irrevocable patent licence to make, have made,
use, offer to sell, sell, import, and otherwise transfer your Contribution,
covering only those patent claims you own or control that are necessarily
infringed by your Contribution alone or by combining it with the project.

If any entity brings patent litigation alleging that the project or a
Contribution within it constitutes patent infringement, the patent licences
granted here to that entity terminate as of the date the litigation is filed.

### 4. You have the right to grant this

You represent that:

- Each Contribution is your original creation, or you have the right to submit
  it under this agreement.
- If your employer has rights to work you create, you have received permission
  to make the Contribution on their behalf, or your employer has waived those
  rights, or your employer has signed this CLA.
- Your Contribution does not knowingly include third-party code that you are
  not entitled to submit, and you have identified any third-party licences or
  restrictions you are aware of.

### 5. No obligation, and no warranty

We are not obliged to use or merge your Contribution. Except for the
representations in section 4, your Contribution is provided "as is," without
warranty of any kind.

### 6. Notice of change

If any of the representations in section 4 stop being accurate, you agree to
tell us.

## How to agree

Add yourself to [`.github/cla-signatures.json`](./.github/cla-signatures.json)
in the same pull request as your first contribution:

```json
{
  "username": "your-github-username",
  "name": "Your Name",
  "signedAt": "2026-08-25"
}
```

That commit, authored by you under your own GitHub account, **is** the
signature. There is no bot and no external service — the agreement lives in
the git history, which is a better record than either.

The `cla` check on your pull request verifies it and will tell you exactly
what to add if you forget. You only sign once; it covers all your future
contributions. You can run the same check locally with `pnpm check:cla`.

Contributing on behalf of a company? Put the company in the `name` field, say
so in the pull request, and make sure you are authorised to bind them.

Questions about any of this are welcome — open an issue or ask in the pull
request before signing.
