/**
 * Server API entrypoint — thin facade over the shared Electrum pool.
 * Kept as `@/lib/electrumServer` so existing route imports stay stable.
 */

export { callElectrumX } from './electrum/pool';
