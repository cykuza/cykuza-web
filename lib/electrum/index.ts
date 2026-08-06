export type {
  Capability,
  CapabilityProfile,
  ElectrumCall,
  ElectrumNetwork,
} from './types';
export { EXPLORER_PROFILE, WALLET_PROFILE } from './types';

export { ElectrumError, toElectrumError, methodRequiresTxGet } from './errors';
export type { ElectrumFailureKind } from './errors';

export { CircuitBreaker, getSharedCircuitBreaker } from './circuit';
export {
  getElectrumServerUrls,
  electrumEnvVarName,
  requireElectrumServerUrls,
} from './servers';
export { probeTxGet, probeScripthash, probeCapability } from './probe';
export { ElectrumSession } from './session';
export type { ElectrumSessionOptions } from './session';
export { callElectrumX } from './pool';

export type {
  ChainTip,
  ElectrumXInput,
  ElectrumXMwebExtension,
  ElectrumXOutput,
  ElectrumXTransaction,
  ScripthashBalance,
  ScripthashHistoryEntry,
} from './protocol';
export {
  getBlockHeaderHex,
  getChainTip,
  getScripthashBalance,
  getScripthashHistory,
  getScripthashMempool,
  getTransaction,
  getTxidFromPos,
} from './rpc';

export {
  assessElectrumTrust,
  assertElectrumTrustAllowsChainOps,
  electrumTrustBlocksChainOps,
  ElectrumTrustBlockedError,
} from './electrumTrust';
export type { ElectrumTrustLevel, ElectrumTrustInput } from './electrumTrust';
export { chainFingerprint, chainFingerprintCanonical } from './fingerprint';
export {
  dualVerifyRefresh,
  dualVerifyBroadcast,
  ElectrumVerifyError,
} from './dualVerify';
export { trustBanner } from './trustBanner';
export {
  readVerifyWithSecondServer,
  writeVerifyWithSecondServer,
} from './trustPrefs';
