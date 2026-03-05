# CoinBot - Automated Cryptocurrency Trading System

A professional crypto trading bot with real-time dashboard and automated execution.

## Architecture

```
coinbot/
├── coinbot-web/       # Next.js Dashboard (Frontend)
├── coinbot-worker/    # Trading Bot Worker (Backend)
└── docker-compose.yml # Orchestration
```

## Quick Start

### 1. Dashboard (Development)
```bash
cd coinbot-web
npm install
npm run dev
# Open http://localhost:3000
```

### 2. Trading Worker
```bash
cd coinbot-worker
npm install
npm run build
npm run start:prod  # Runs migrations + starts bot
```

### 3. Docker (Production)
```bash
cd coinbot-worker
docker build -t coinbot-worker .
docker-compose up -d
```

## Environment Variables

Both apps need `DATABASE_URL` pointing to Railway PostgreSQL:
```
DATABASE_URL="postgresql://user:pass@host:port/db"
```

See `.env.example` in each folder for full configuration.

## Features

- **Dashboard**: Real-time charts, trade logs, bot control
- **Worker**: Cost estimation, slippage calculation, risk management
- **Database**: Railway PostgreSQL with shadow ledger
- **Deployment**: Docker + Railway ready

## Risk Management

- Daily loss limits (auto-pause on breach)
- Position size limits
- Break-even price calculation before every trade
