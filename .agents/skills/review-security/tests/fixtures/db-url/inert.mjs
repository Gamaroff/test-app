/**
 * Measured defect B, INERT variant.
 *
 * The control is PRESENT: `sslmode=require` is right there in the source. A
 * grep finds it. A reviewer reads it and concludes TLS is required. A test
 * asserting the DSN contains `sslmode=require` would pass.
 *
 * It is INERT because the parameters are CONCATENATED. A component carrying
 * `?sslmode=disable` lands ahead of the appended `?sslmode=require`, and
 * libpq takes the first — so the appended value is decoration. A component
 * containing `/` additionally ends the authority, silently dropping the port
 * and re-pointing the connection.
 *
 * It rejects empty and whitespace, so it is not `absent`; it accepts the seven
 * hostile shapes that matter, so it is not `engages`.
 */
const DEFAULT_PARAMS = "?sslmode=require";

export function composeDbUrl(authority) {
  if (typeof authority !== "string" || authority === "") return false;
  if (/\s/.test(authority)) return false;

  // String building all the way down. Nothing here parses anything.
  return `postgres://app@${authority}/appdb${DEFAULT_PARAMS}`;
}
