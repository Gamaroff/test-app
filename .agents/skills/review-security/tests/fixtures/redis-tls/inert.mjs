/**
 * Measured defect A, INERT variant — the shape this whole skill exists to catch.
 *
 * The control is PRESENT. A grep for `tls` hits. A grep for `rejectUnauthorized`
 * hits. A reviewer reads it, sees TLS configured, and believes it. A unit test
 * asserting `options.tls` is defined would pass on the branch below.
 *
 * It is also INERT: the TLS block is gated on an environment variable nothing
 * sets, and the host check catches only the obvious shapes — so the hostile
 * inputs that actually re-point a connection (`evil.example.com/x`, `p@ss`,
 * `[::1]`) pass straight through.
 *
 * That mix is what makes the verdict `present-but-inert` rather than `absent`:
 * it must reject at least one hostile case (it rejects whitespace and empty)
 * AND accept at least one (it accepts the other seven).
 */
export function buildRedisOptions(authority) {
  // The whole of the "validation". Catches a typo; catches nothing adversarial.
  if (typeof authority !== "string" || authority === "") return false;
  if (/\s/.test(authority)) return false;

  const options = { host: authority, port: 6379 };

  // Reads as TLS configuration to anything that does not execute it. Nothing
  // sets REDIS_TLS — and inside the probe sandbox nothing can.
  if (process.env.REDIS_TLS === "true") {
    options.tls = { rejectUnauthorized: true, servername: authority };
  }

  return options;
}
