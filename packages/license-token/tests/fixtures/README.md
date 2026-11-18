# PASETO v4 test vectors

`paseto-v4.json` is `v4.json` from
[paseto-standard/test-vectors](https://github.com/paseto-standard/test-vectors), byte for byte,
at commit `32d7406591eb022f9eff88abb84106dd9d42c0f2`:

https://raw.githubusercontent.com/paseto-standard/test-vectors/32d7406591eb022f9eff88abb84106dd9d42c0f2/v4.json

- sha256: `0b72948b65d1f73f574c9ad2aa3481ec27bf8c632f5f6e1596cd41f5b9703387`.
  `tests/paseto-vectors.test.ts` fails if the file changes.
- License: ISC, Copyright (c) 2021 Paragon Initiative Enterprises. The text is in
  `PASETO-TEST-VECTORS-LICENSE`, fetched from the same commit.
- Test data only. It is not part of the npm package (`files` ships `dist/`, `README.md` and
  `LICENSE` only) or any runtime image.
- The `secret-key`, `secret-key-pem` and `key` values are the published test vectors' own keys,
  not secrets.

Do not edit or reformat it; `pnpm format` would. To move to a newer upstream commit, download
both files again from that commit and update the commit and sha256 here and in the test.
