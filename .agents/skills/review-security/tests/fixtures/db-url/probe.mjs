/**
 * Probe specs for the db-url fixtures. See redis-tls/probe.mjs for the contract.
 */
const DIR = "skills/review-security/tests/fixtures/db-url";

export const engaged = {
  sink: "url-authority",
  entry: `${DIR}/engaged.mjs#composeDbUrl`,
};

export const inert = {
  sink: "url-authority",
  entry: `${DIR}/inert.mjs#composeDbUrl`,
};

export default { engaged, inert };
