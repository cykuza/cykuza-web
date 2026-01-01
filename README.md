# Cyberyen Explorer & Wallet

A lightweight, non-custodial blockchain explorer and wallet for Cyberyen.

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
- **Create New Wallet**: Generate a new wallet with a 12-word mnemonic phrase
- **Import Wallet**: Import from mnemonic phrase or private key (WIF format)
- **Send Transactions**: Send Cyberyen (CY) with customizable fee rates
- **Receive Addresses**: Generate and display receive addresses with QR codes
- **Transaction History**: View complete transaction history with real-time updates
- **Balance Display**: See confirmed and unconfirmed balances
- **Password Protection**: Secure wallet sessions with AES-256-GCM encryption
- **Session Management**: Automatic 10-minute idle timeout
- **Multi-Server Support**: Automatic failover between multiple Electrum servers

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Blockchain Libraries**: bitcoinjs-lib (customized for Cyberyen)
- **Cryptography**: Web Crypto API (PBKDF2, AES-GCM)
- **QR Codes**: qrcode.react
- **Validation**: Zod

## Prerequisites

- **Node.js**: 18+
- **npm** or **yarn**
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

### Wallet Security
- **Non-Custodial**: All wallet operations are client-side only
- **AES-256-GCM Encryption**: Industry-standard encryption for wallet data
- **PBKDF2 Password Hashing**: 100,000 iterations for password verification
- **Rate Limiting**: Maximum 5 password unlock attempts with 15-minute lockout
- **Session Storage Only**: No persistent storage - data cleared on browser close
- **HTTPS Enforcement**: Automatic redirect from HTTP to HTTPS in production
- **Content Security Policy**: Comprehensive CSP headers to prevent XSS attacks

### Security Headers
- HSTS (Strict-Transport-Security)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- X-XSS-Protection
- Referrer-Policy
- Permissions-Policy

## Rate Limiting

All API endpoints are rate-limited to **10 requests per minute per IP address**. Rate limit information is included in response headers:

- `X-RateLimit-Remaining`: Number of requests remaining
- `429` status code with `Retry-After` header when limit exceeded

## Development

### Available Scripts

```bash
# Development server
npm run dev

# Production build
npm run build

# Start production server
npm start

# Linting
npm run lint

# Type checking
npm run type-check
```

### Testing

```bash
npm test
```

## Important Notes

### Limitations
- **Session-Based**: Wallet data is cleared when the browser is closed
- **ElectrumX Required**: Requires access to Electrum servers
- **Rate Limited**: API endpoints rate-limited to 10 requests/minute per IP

### Best Practices
- **Backup Your Mnemonic**: Always write down your mnemonic phrase in a secure location
- **Use Strong Passwords**: Choose a strong password for wallet protection
- **Verify Addresses**: Always verify addresses before sending transactions
- **Check Fees**: Review transaction fees before confirming

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/Feature`)
3. Commit your changes (`git commit -m 'Add some Feature'`)
4. Push to the branch (`git push origin feature/Feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Next.js](https://nextjs.org/) and [TypeScript](https://www.typescriptlang.org/)
- Uses [bitcoinjs-lib](https://github.com/bitcoinjs/bitcoinjs-lib) for Bitcoin/Cyberyen operations
- [ElectrumX](https://electrumx.readthedocs.io/) protocol for blockchain data
- [Tailwind CSS](https://tailwindcss.com/) for styling

## Support

For issues, questions, or contributions:
- Open an issue on [GitHub](https://github.com/cykuza/cykuza-web/issues)
- Check the documentation files
- Review the security analysis

---

**Version**: 1.0.0
**Status**: Production Ready
