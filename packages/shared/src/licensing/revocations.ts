/**
 * The signed revocation list shipped with this release: a PASETO v4.public
 * token carrying the opensteward-revocations-v1 assertion, signed by a
 * production kid (P9). A string constant because tsc copies no non-TS assets.
 * The first list came from the license service in A3.9: empty, signed by
 * k2026a, iat 2026-11-07T16:19:31Z. Sign and commit a fresh one before every
 * release. No imports: the release gate loads this file from source.
 */
export const REVOCATION_LIST_TOKEN: string | null =
  'v4.public.eyJpYXQiOiIyMDI2LTExLTA3VDE2OjE5OjMxWiIsInJldm9rZWQiOltdLCJ2ZXIiOjF9AePJreR-ExEt2ySRJBD8Pwcf7necuNWAcJEe6NLeTJQeYitqyybzWVPf5ARH8Fg81P6CLZFwuIshJlXw802BDQ.eyJraWQiOiJrMjAyNmEifQ'
