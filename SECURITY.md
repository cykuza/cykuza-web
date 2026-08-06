# Security

Cykuza Web is a **non-custodial hot wallet** and blockchain explorer. Private keys and mnemonics exist only in the browser session (`sessionStorage` ciphertext + in-memory key material). They are never sent to Cykuza servers.

## Threat model (honest limits)

- Protects against casual theft of resting ciphertext in the tab session and against shipping known high/critical vulnerable dependencies.
- Does **not** stop malware with full access to the browser process, malicious / fake browser extensions, or a compromised browser profile.
- Does **not** claim Argon2id stops RAM scrapers.
- A single compromised Electrum endpoint can still lie when only one server is configured (`single`); dual verify mitigates multi-endpoint disagreement (see Electrum trust).
- Out of scope: hardware wallets, full SPV, Dependabot/Renovate.

## Seed entropy (W1)

- Default new wallet: **24-word** CSPRNG (`crypto.getRandomValues` only; fail-closed if missing).
- Advanced modes: `mixed` (CSPRNG ‖ user) and `user` (user only). Mix rule: `SHA256(csprng ‖ user)` truncated to 16/32 bytes. Dice is UTF-8 hash-accumulate of digits `1–6` (no biased packing).
- Dice minima: mixed ≥20; user 12-word ≥50; user 24-word ≥100. Hex minima: mixed ≥8 bytes; user ≥16/32 bytes.
- Import accepts **12 or 24** words only (BIP39 checksum + length gate).
- Backup flow requires written-down ack, hot-wallet/Electrum ack, and a **3-word quiz** before sealing the session vault.
- Pending create/import secrets are held in **refs**, not published on React context state.

## BIP39 passphrase (W2)

- Optional BIP39 passphrase (25th word) on **create** and **mnemonic import** only. Private-key import rejects a passphrase.
- Session vault envelope (readable while locked): `version`, `passphraseRequired`, AES-GCM fields. Ciphertext payload whitelist: `kind`, `secret`, optional `seedFingerprint` — never stores the passphrase.
- When `passphraseRequired`, seal includes a 32-hex `seedFingerprint` = first 16 bytes of `SHA256(BIP39 seed)`.
- Unlock is **decrypt-first**: wrong vault password, wrong/missing passphrase, and fingerprint mismatch all surface as the same user copy (`Unlock failed. N attempts remaining.`) so the UI does not oracle which factor failed. `WrongBip39PassphraseError` is domain-internal only.
- Passphrase is never written to `sessionStorage`, React context value, or vault JSON. UI clears passphrase fields on unmount.
- Pre-W2 ciphertext (raw encrypted mnemonic/WIF string) and W2 PBKDF2 v1 envelopes open as legacy and migrate to **v2 Argon2id** on successful unlock.

## Session lock + password policy (W3)

- Default idle auto-lock: **5 minutes** (`DEFAULT_AUTO_LOCK_MS`). Idle and lock-on-hide both call `lockWallet` (wipe in-memory keys; keep `sessionStorage` vault).
- Best-effort lock on `visibilitychange` / `pagehide` when a vault exists and the wallet is unlocked (idle timer remains the reliable path).
- New vault passwords: trimmed length **≥ 12** via domain `passwordPolicy` (create / import / set-password only). Unlock does **not** re-enforce length so legacy shorter passwords still open.
- Single lock authority in `WalletContext` — no separate idle path that ends/reloads the session.

## Vault KDF (W3b)

- New seals: envelope **version 2**, `kdf: 'argon2id'`, AES-256-GCM. Argon2id params match the extension: memory 64 MiB, iterations 3, parallelism 1, hash length 32, salt 16 / IV 12.
- Exact pin: `hash-wasm@4.12.0`. CSP includes `'wasm-unsafe-eval'` in `script-src` so WASM KDF can run.
- Legacy open: v1 PBKDF2 structured payloads and pre-version raw EncryptedData still decrypt; successful unlock rewrites to v2.
- Decrypt-first unlock; wrong password after Argon2/GCM → `VaultOpenError` → unified unlock copy (no factor oracle).

## Send safeguards (W4)

- Enforced in domain (`assertSendSafeguards`) and `WalletContext.send` **before** sign/broadcast — not UI-only.
- **Address confirm:** every send requires typing the last **6** characters of the recipient (`ADDRESS_CONFIRM_SUFFIX_LENGTH`).
- **Address book:** optional `localStorage` labels (max 50 / label 40); picker only — not a gate. Invalid book entries rejected via network-aware Bech32 validation.
- **Daily spend:** optional CY limit stored as sats; exceed requires `allowSpendLimitOnce`. Usage recorded after successful broadcast (local calendar day). Cleared on full session wipe.
- **Large send:** total (recipient output + fee) **> 50%** of confirmed balance requires `acknowledgeLargeSend`.
- Typed `SendError` codes match extension messaging for mismatch / override / large-send ack.

## Electrum trust (W5)

- Dual **balance + UTXO** fingerprint (`chainFingerprint`) across ≥2 configured WSS endpoints when **Verify with second server** is on (default **on**, `localStorage`).
- Dual **broadcast txid** cross-check on send under the same guard.
- Domain policy (`assessElectrumTrust` / `assertElectrumTrustAllowsChainOps`): `verify_off` and `degraded` **block** refresh and send — not UI-only. Web `permittedCount` = reachable/usable endpoints (not Chrome host grants).
- Runtime codes: `SERVERS_DISAGREE` (fingerprint or txid mismatch), `VERIFY_FAILED` (secondary connect/RPC failed while verify required), `electrum_trust_blocked`.
- Tip-probe / session circuit remain capability failover only — they are **not** dual trust.
- Banners map domain trust levels (`trustBanner`); Refresh/Send disable when `electrumTrustBlocksChainOps`.

## Dependency policy

- **No Dependabot / Renovate.** Manual upgrades only.
- CI runs `npm audit --audit-level=high` and fails the job on high/critical findings.
- Wallet crypto packages are **exact-pinned** (no `^` / `~`):

  | Package | Pin |
  |---------| | ----- |
  | `@scure/bip39` | `2.2.0` |
  | `bip32` | `5.0.1` |
  | `bitcoinjs-lib` | `7.0.1` |
  | `ecpair` | `3.0.1` |
  | `@bitcoinerlab/secp256k1` | `1.2.0` |
  | `hash-wasm` | `4.12.0` |

- Do **not** use `npm audit fix --force` to jump majors. Prefer deliberate upgrades and, if unavoidable, `overrides` documented here with a reason.
- Current `overrides`: `uint8array-tools@0.0.9` — unify nested 0.0.8/0.0.9 so bitcoinjs-lib 7 gets `writeInt64` (required for PSBT signing).
- Never add `.npmrc` audit suppressions or Dependabot config.

## Release integrity (W6)

- Releases are cut as an **annotated git tag** plus a **GitHub Release** (source/deploy — not a browser zip).
- Pre-parity baseline tag **`v1.0.0-pre-parity`** @ commit `8a629446a6ea9f7504509f324ed7acccce004348` — see [docs/release/v1.0.0-pre-parity.md](docs/release/v1.0.0-pre-parity.md).
- Current line: [docs/release/v1.1.0.md](docs/release/v1.1.0.md).
- There are **no** downloadable browser-zip artifacts to hash (unlike the extension). Verify a release via:
  1. Matching tag → commit SHA
  2. `npm run hash:release-inputs` (SHA-256 of `package-lock.json` + printed exact crypto pins)
  3. CI `npm audit --audit-level=high` on that tree

## Derivation paths (W0)

- **Canonical (new wallets):** BIP84 leaf `m/84'/802'/0'/0/0` (parity with cykuza-extension).
- **Legacy-web (pre-W0):** the old web wallet incorrectly derived an extra `/0/0` → `m/84'/802'/0'/0/0/0/0`.
- On mnemonic **import / unlock**, the wallet probes both addresses via Electrum (explorer API) and selects:
  - legacy-web if only legacy has funds/history;
  - bip84 if only bip84 has funds/history, or both are empty;
  - legacy-web if **both** have history (preserves older funds; UI warns).
- **Fail-closed:** if no non-secret path hint is stored and the network probe fails, restore does **not** silently open an empty BIP84 wallet.
- Optional `localStorage` hint maps a non-secret mnemonic fingerprint → path id (never the mnemonic itself).

## Reporting

Report security issues privately to the maintainers. Do not open public issues that include seed phrases, private keys, or production Electrum credentials.
