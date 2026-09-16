/**
 * Measured defect B, ENGAGED variant.
 *
 * Composes a Postgres DSN from an untrusted authority component. Every part is
 * percent-encoded or validated before it reaches the string, and connection
 * parameters are set through `URLSearchParams` rather than concatenated — so a
 * `?` arriving inside the component cannot become a parameter.
 *
 * One argument, by the engine's contract. Rejection is `false`.
 */
export function composeDbUrl(authority) {
  if (typeof authority !== "string" || authority === "") return false;

  // Judge `:` by what follows it — `db.internal.example.com:5432` is a port and
  // is legitimate; `pa:ss` is a truncated credential and is not.
  const m = /^([a-z0-9.-]+)(?::([0-9]+))?$/i.exec(authority);
  if (!m) return false;

  const [, host, port] = m;
  if (host.includes("..") || host.startsWith(".") || host.endsWith(".")) {
    return false;
  }

  const url = new URL("postgres://placeholder/");
  url.hostname = host;
  url.port = port ?? "5432";
  url.username = encodeURIComponent("app");
  url.pathname = `/${encodeURIComponent("appdb")}`;

  // Set, never appended: a caller cannot smuggle a competing value in ahead of
  // this one, because there is no string to smuggle it into.
  const params = new URLSearchParams();
  params.set("sslmode", "require");
  url.search = params.toString();

  // The composed URL must still round-trip to the host we validated. A setter
  // that silently truncated is caught here rather than at connection time.
  if (url.hostname !== host.toLowerCase()) return false;

  return url.toString();
}
