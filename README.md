# MeghaSales CRM - Next.js Full-Stack

> **Tech:** Next.js 14 (App Router) + Prisma + PostgreSQL + NextAuth.js + Tailwind CSS
> **Deployment:** Vercel (frontend + API) + Cloud Postgres (Supabase/Neon)
> **Backup of Spring Boot version:** `/Users/yesudassudhakar/meghasales-backup-springboot`

## Status: Phase 2 Complete ✅

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | ✅ Done | Project scaffold, Prisma ORM, NextAuth.js |
| 2 | ✅ Done | API routes (leads, quotation-config, taxes, pricing calculator) |
| 3 | 🔵 Partial | Frontend pages (Login, Dashboard, Layout done; Leads/Quotations are placeholders) |
| 4 | ✅ Done | Tax engine + pricing logic ported to TypeScript |
| 5 | ⏳ Ready | Vercel deployment (build passes, ready to deploy) |

## Quick Start

```bash
cd /Users/yesudassudhakar/meghasales-next

# Install deps (already done)
npm install

# Setup database
createdb meghasales_next
npx prisma migrate dev
npx tsx prisma/seed.ts

# Run development server
npm run dev
# → http://localhost:3000
```

**Login:** `admin@tekfilo.com` / `admin123`

## API Routes (All Working ✅)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/[...nextauth]` | NextAuth.js login/session |
| GET | `/api/leads?search=&status=&page=&size=&sortBy=&sortDir=` | Search/filter leads |
| POST | `/api/leads` | Create lead |
| GET/PUT/DELETE | `/api/leads/[id]` | Lead CRUD |
| GET | `/api/quotation-config` | Get modules (or ?type=addons/currencies/company-profile) |
| GET | `/api/quotation-config/taxes?country=IN&type=states` | Get tax rules / states |
| POST | `/api/quotation-config/calculate` | Multi-module pricing calculation |
| GET | `/api/status/[module]` | Get statuses for a module |

## Database Models (17)

User, Role, Permission, RolePermission, Lead, LeadActivity, Demo, Quotation, Implementation, QuotationModuleConfig, QuotationAddonConfig, CountryTaxMaster, StateTaxMaster, CurrencyMaster, CompanyProfile, Notification, StatusMaster, AuditLog

## Seed Data

- 6 roles, 2 users
- 4 business modules (Trading ₹2.5L, Jewellery ₹3.5L, Manufacturing ₹4L, Accounts ₹1.5L)
- 6 add-ons, 6 currencies, 9 country tax rules, 30 state tax entries
- Company profile (Tekfilo)

## Vercel Deployment

1. Push to GitHub:
```bash
git add . && git commit -m "Initial Next.js full-stack CRM"
git remote add origin <your-repo-url>
git push -u origin main
```

2. Import in Vercel (vercel.com → New Project → Import Git)

3. Set environment variables in Vercel:
```
DATABASE_URL=postgresql://user:pass@host:5432/meghasales_next
NEXTAUTH_SECRET=<generate-random-secret>
NEXTAUTH_URL=https://your-app.vercel.app
```

4. For database, use one of:
   - **Vercel Postgres** (built-in)
   - **Supabase** (free tier)
   - **Neon** (free tier, serverless)
   - **Railway** (easy setup)

5. Deploy! Vercel auto-builds and deploys on push.

## What's Next (Phase 3 - Frontend Pages)

To complete the frontend, the remaining work is:
- Full Leads page (search, filter, sort, create, edit — API ready)
- Full Quotations page (multi-module, custom modules, PDF, taxes — API ready)
- Demos page
- Settings page (company profile, tax config, module config)

All API endpoints are ready — just need the React UI components.

## Project Structure

```
meghasales-next/
├── prisma/
│   ├── schema.prisma          # 17 models
│   ├── seed.ts                # Seed data
│   └── migrations/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── leads/route.ts
│   │   │   ├── leads/[id]/route.ts
│   │   │   ├── quotation-config/route.ts
│   │   │   ├── quotation-config/calculate/route.ts
│   │   │   ├── quotation-config/taxes/route.ts
│   │   │   └── status/[module]/route.ts
│   │   ├── dashboard/
│   │   │   ├── layout.tsx     # Sidebar + auth guard
│   │   │   ├── page.tsx       # Dashboard home
│   │   │   ├── leads/page.tsx
│   │   │   ├── quotations/page.tsx
│   │   │   ├── demos/page.tsx
│   │   │   └── settings/page.tsx
│   │   ├── login/page.tsx
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Redirect to /dashboard
│   │   ├── providers.tsx      # NextAuth + React Query
│   │   └── globals.css
│   └── lib/
│       ├── auth.ts            # NextAuth config
│       └── prisma.ts          # Prisma client singleton
├── .env
├── .eslintrc.json
├── next.config.mjs
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```
# meghasales
