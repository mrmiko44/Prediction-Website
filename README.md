# WinGo AI Prediction Platform

## Project Overview
- **Name**: WinGo AI Prediction
- **Goal**: AI-powered color & size prediction platform for WinGo trading games
- **Status**: Production-ready demo with in-memory storage (Supabase guide included)

## Live URLs
- **Sandbox**: See GetServiceUrl output
- **GitHub**: Push to your repository

## Features (Completed)

### Pages (12 total)
| Page | Route | Description |
|------|-------|-------------|
| Landing | `/` | Marketing page with features, game modes |
| Login | `/login` | User authentication |
| Sign Up | `/signup` | New user registration |
| Predictions | `/predictions` | AI predictions with countdown, locked for free users |
| History | `/history` | Full game result browser |
| Statistics | `/statistics` | Analytics with number frequency, missing analysis |
| Subscription | `/subscription` | 4 pricing plans (BDT 180-19,999) |
| Profile | `/profile` | User info, subscription status |
| Settings | `/settings` | Update name/password |
| Wallet | `/wallet` | Payment transaction history |
| Admin | `/admin` | Admin panel (users, payments, stats) |
| About | `/about` | AI models & game rules |

### AI Prediction Engine
- **Model 1** - Markov Chain: Multi-order (1st, 2nd, 3rd) with transition matrices
- **Model 2** - LSTM Neural Network: Monte Carlo simulation (500 iterations), momentum analysis
- **Prediction Types**: Color (Green/Red/Violet) & Size (Big/Small)
- **Recent History**: Last 20 periods with Predicted/Result/Status columns

### Authentication & Access Control
- User registration and login
- Admin login via email + day-specific password (pattern: `WG{day*3}{month_reversed}{year_last_2}`)
- **Prediction page locked for free users** - requires active subscription
- Session management with tokens

### Admin Panel
- Dashboard stats (users, premium, pending payments, revenue)
- Payment request management (approve/reject)
- User management (activate/deactivate subscriptions)
- Day password display

### Payment System
- 4 plans: Weekly (৳180), Monthly (৳499), Yearly (৳4,999), Lifetime (৳19,999)
- Payment via bKash/Nagad/Rocket with transaction ID
- Admin approval workflow

## API Endpoints
| Method | Endpoint | Auth |
|--------|----------|------|
| POST | `/api/auth/register` | Public |
| POST | `/api/auth/login` | Public |
| GET | `/api/auth/me` | Token |
| PUT | `/api/auth/profile` | Token |
| GET | `/api/game-history/:gameType` | Public |
| GET | `/api/predict/:gameType/:modelType` | Public |
| GET | `/api/stats/:gameType` | Public |
| GET | `/api/config` | Public |
| POST | `/api/payment/submit` | Token |
| GET | `/api/payment/history` | Token |
| GET | `/api/admin/stats` | Admin |
| GET | `/api/admin/users` | Admin |
| GET | `/api/admin/payments` | Admin |
| POST | `/api/admin/payment/:id/:action` | Admin |
| POST | `/api/admin/activate` | Admin |
| POST | `/api/admin/deactivate` | Admin |

## Tech Stack
- **Backend**: Hono + TypeScript (Cloudflare Workers)
- **Frontend**: Vanilla JS SPA + TailwindCSS CDN
- **Color Palette**: Deep navy (#0c1222) + Cyan/Teal (#06b6d4) + Purple (#a855f7)
- **Icons**: FontAwesome 6.5
- **Fonts**: Inter + JetBrains Mono

## Deployment
- **Platform**: Cloudflare Pages (current) / Vercel / Netlify (see guide.md)
- **Guide**: See `guide.md` for complete Supabase + Ubuntu deployment
- **Last Updated**: 2026-02-10
# Prediction-Website
