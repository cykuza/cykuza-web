# Cyberyen Explorer & Wallet

A lightweight, non-custodial blockchain explorer and wallet for Cyberyen.

**Version:** [1.1.0](docs/release/v1.1.0.md) · **Baseline:** [v1.0.0-pre-parity](docs/release/v1.0.0-pre-parity.md)

## Features

### Explorer
- **Real-time Block Browser**: Browse blocks by height or hash
- **Transaction Details**: View detailed transaction information with inputs/outputs
- **Address Lookup**: Check address balances and transaction history
- **Network Statistics**: Real-time network statistics and metrics
- **Latest Blocks & Transactions**: View the most recent blockchain activity
- **Search Functionality**: Search for blocks, transactions, and addresses
- **MWEB Support**: Special handling for confidential Mimblewimble transactions
- **Mobile Responsive**: Fully responsive design for all devices

### Wallet
- **Create New Wallet**: Generate a new wallet with a 24-word mnemonic (12 optional); optional dice/hex entropy mix
- **Import Wallet**: Import from 12 or 24 word mnemonic or private key (WIF format)
- **Send Transactions**: Send Cyberyen (CY) with customizable fee rates
- **Receive Addresses**: Generate and display receive addresses with QR codes
- **Transaction History**: View complete transaction history with real-time updates
- **Balance Display**: See confirmed and unconfirmed balances
- **Password Protection**: Vault password ≥12; Argon2id + AES-256-GCM session vault
- **Session Management**: Automatic 5-minute idle lock + lock when the tab hides
- **Send Safeguards**: Last-6 address confirm, optional daily spend limit, large-send ack (domain-enforced)
- **Multi-Server Support**: Automatic failover between Electrum servers, plus optional dual-server balance/UTXO fingerprint and broadcast txid verify (default on)

### Extension & Privacy
- **Extension page** (`/extension`): install / source links for the Cykuza browser wallet
- **Privacy** (`/privacy`): public privacy policy for the site and extension

## Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Blockchain Libraries**: bitcoinjs-lib 7, bip32 5, ecpair 3, `@scure/bip39` (exact pins — see [SECURITY.md](SECURITY.md))
- **Cryptography**: Argon2id (`hash-wasm`) + AES-GCM for session vault; Web Crypto for legacy PBKDF2 open
- **QR Codes**: qrcode.react
- **Validation**: Zod 3

## Prerequisites

- **Node.js**: 20.9+ (22 LTS recommended for CI)
- **npm**
- **Access to ElectrumX servers** for Cyberyen networks

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/cykuza/cykuza-web.git
cd cykuza-web
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
# ElectrumX Server URLs (comma-separated for failover)
NEXT_PUBLIC_ELECTRUMX_MAINNET=wss://mainnet-server1:50004,wss://mainnet-server2:50004
NEXT_PUBLIC_ELECTRUMX_TESTNET=wss://testnet-server1:50004,wss://testnet-server2:50004

# Rate Limiting
RATE_LIMIT_REQUESTS=10
RATE_LIMIT_WINDOW=60000

# Default Network
NEXT_PUBLIC_DEFAULT_NETWORK=mainnet
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Releases

| Version | Notes |
|---------|--------|
| **1.1.0** (current) | [docs/release/v1.1.0.md](docs/release/v1.1.0.md) — security parity (W0–W7), Next 16, exact crypto pins |
| **v1.0.0-pre-parity** | [docs/release/v1.0.0-pre-parity.md](docs/release/v1.0.0-pre-parity.md) — baseline @ `8a62944` ([GitHub Release](https://github.com/cykuza/cykuza-web/releases/tag/v1.0.0-pre-parity)) |

Before cutting a GitHub release, run `npm run hash:release-inputs` and record the lockfile SHA-256 in the release body.

## API Endpoints

All API endpoints are prefixed with `/api` and return JSON:

- `GET /api/block?height=123&network=mainnet` - Get block by height
- `GET /api/block?hash=abc...&network=mainnet` - Get block by hash
- `GET /api/tx?hash=abc...&network=mainnet` - Get transaction
- `GET /api/address?address=cy1q...&network=mainnet` - Get address info
- `GET /api/network-stats?network=mainnet` - Get network statistics
- `GET /api/latest-blocks?network=mainnet&limit=10` - Get latest blocks
- `GET /api/latest-transactions?network=mainnet&limit=10` - Get latest transactions

See `/api-docs` for complete API documentation.

**Note:** REST API endpoints work on traditional server deployments (local dev, VPS, Docker) but have limitations on serverless platforms like Vercel due to ElectrumX protocol requirements. The frontend automatically uses direct client-side connections when deployed on serverless platforms.

## Security

See [SECURITY.md](SECURITY.md) for the threat model, exact crypto pins, release integrity, and control details.

### Highlights
- **Non-custodial** session vault (Argon2id + AES-256-GCM); secrets never leave the browser
- **5-minute** idle lock; password ≥12; unlock lockout after 5 failures
- **Send safeguards** and **Electrum dual-server** verify (domain-enforced)
- **HTTPS** redirect (`proxy.ts`) + CSP / HSTS in `next.config.js`

## Rate Limiting

All API endpoints are rate-limited to **10 requests per minute per IP address**. Rate limit information is included in response headers:

- `X-RateLimit-Remaining`: Number of requests remaining
- `429` status code with `Retry-After` header when limit exceeded

## Development

```bash
npm run dev      # development server
npm run build    # production build
npm start        # start production server
npm run lint     # eslint
npm test         # jest
npm run hash:release-inputs   # lockfile SHA-256 + crypto pins
```

CI (GitHub Actions) runs `npm audit --audit-level=high`, lint, test, and build on every PR. Dependency upgrades are **manual** — no Dependabot.

## Contributors

See [docs/CONTRIBUTORS.md](docs/CONTRIBUTORS.md) for GitHub contacts.

| GitHub | Profile |
|--------|---------|
| digirayc | [github.com/digirayc](https://github.com/digirayc) |
| cymich | [github.com/cymich](https://github.com/cymich) |

Org: [github.com/cykuza](https://github.com/cykuza)

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/Feature`)
3. Keep security logic in `lib/` domain modules (no UI-only gates)
4. Run audit → lint → test → build
5. Open a Pull Request

Issues and PRs: [github.com/cykuza/cykuza-web](https://github.com/cykuza/cykuza-web)

## License

This project is licensed under the MIT License — see [LICENSE](LICENSE).

## Acknowledgments

- [Next.js](https://nextjs.org/) and [TypeScript](https://www.typescriptlang.org/)
- [bitcoinjs-lib](https://github.com/bitcoinjs/bitcoinjs-lib)
- [ElectrumX](https://electrumx.readthedocs.io/)
- [Tailwind CSS](https://tailwindcss.com/)
