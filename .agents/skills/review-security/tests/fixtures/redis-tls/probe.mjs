/**
 * Probe specs for the redis-tls fixtures.
 *
 * A spec is `{ sink, entry }` and nothing more — no verdict field, because the
 * agent that writes a spec is not the thing that decides the outcome.
 * `runProbeSpec` supplies the cases from `corpusFor(sink)`, runs each in a
 * sandboxed child, and calls `computeVerdict` on the results.
 */
const DIR = "skills/review-security/tests/fixtures/redis-tls";

export const engaged = {
  sink: "url-authority",
  entry: `${DIR}/engaged.mjs#buildRedisOptions`,
};

export const inert = {
  sink: "url-authority",
  entry: `${DIR}/inert.mjs#buildRedisOptions`,
};

export default { engaged, inert };
