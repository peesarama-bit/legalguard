# LegalGuard — AI Commercial Relationship Agent

LegalGuard is an AI-powered platform that helps freelancers, consultants, and small studios manage commercial relationships. It scans contracts for predatory clauses, tracks invoices and payment delays, monitors client communications, detects payment promises, and drafts context-aware follow-up emails — all powered by NVIDIA NIM AI models running on Supabase Edge Functions.

## Features

### Contract Scanner
Upload PDF or text contracts. The AI audits for predatory clauses (unlimited revisions, net-60 payment terms, IP transfer upon delivery, etc.), flags risks with plain-English explanations and suggested pushback, and extracts key terms (payment, scope, deadlines, IP, termination, liability).

### Invoice Tracking & AI Follow-up
Track invoices with automatic overdue detection. When an invoice is overdue, generate a context-aware follow-up email in four tones (friendly, professional, firm, final notice) that cites your actual signed contract terms.

### Client Memory
Every client gets a complete commercial profile — contracts, invoices, communications, payment promises, risk level, and relationship health. Run AI analysis on any client to get a risk assessment with evidence and recommended actions.

### Payment Promises
Track every promise a client has made to pay. The AI detects promises from communications automatically, extracts the date and amount, and saves them. Mark promises as fulfilled or missed.

### Scope Creep Defender
Paste a client email asking for "just one more quick change." The AI drafts a professional reply referencing your contract's revision limits and scope definitions.

### Ask My Business
A natural-language chat interface that has full context of your business data. Ask questions like "Which clients are most at risk?" or "How much is overdue across all invoices?"

### Monitoring Dashboard
Real-time operations dashboard showing all activity — contract scans, webhook events, email drafts, invoice status changes — with live updates via Supabase Realtime.

### AI & Integration Settings
Configure your own NVIDIA NIM API key, model, and Stripe webhook secret from the Account page. Keys are stored securely in the database with row-level security.

## Tech Stack

- **Frontend:** React 19 + TypeScript + Vite 8 + Tailwind CSS v4
- **Backend:** Supabase (PostgreSQL + Auth + Realtime + Edge Functions)
- **AI:** NVIDIA NIM API (OpenAI-compatible endpoint)
- **Payments:** Stripe Webhooks
- **Icons:** Lucide React
- **Fonts:** Inter (sans) + Fraunces (serif)

## Architecture

```
src/
├── App.tsx                    # Main app shell, navigation, auth gate
├── main.tsx                   # React entry point
├── index.css                  # Tailwind v4 theme + custom animations
├── lib/
│   ├── supabase.ts            # Supabase client + all TypeScript types
│   ├── auth.tsx               # Auth context provider (sign in/up/out, profile)
│   ├── api.ts                 # Edge function caller wrappers
│   ├── dataAccess.ts          # CRUD functions for all database tables
│   └── format.ts              # Currency, date, risk color formatters
└── views/
    ├── Auth.tsx               # Sign in / sign up screen
    ├── Dashboard.tsx          # Overview with stats, clients, activity
    ├── ContractScanner.tsx    # Upload + AI scan contracts
    ├── Invoices.tsx           # Invoice tracking + AI email drafter
    ├── Clients.tsx            # Client memory + AI risk analysis
    ├── Promises.tsx           # Payment promise tracking
    ├── ScopeDefender.tsx      # AI scope creep reply generator
    ├── AskAI.tsx              # Natural language business Q&A
    ├── Monitoring.tsx         # Realtime operations dashboard
    └── Account.tsx            # Profile + AI/Stripe settings

supabase/
├── migrations/
│   ├── 007a_drop_all_tables.sql.sql   # Clean slate migration
│   └── 007b_fresh_schema.sql.sql      # Full schema with RLS
└── functions/
    ├── ai-contract-scan/index.ts      # Scan contracts for risks
    ├── ai-analyze/index.ts            # Analyze client risk
    ├── ai-chat/index.ts              # Answer business questions
    ├── ai-draft-email/index.ts        # Draft follow-up + scope defense emails
    └── stripe-webhook/index.ts        # Process Stripe webhook events
```

## Database Schema

13 tables with row-level security (RLS) enabled on every table:

| Table | Purpose |
|-------|---------|
| `profiles` | User display name, company, avatar |
| `workspace_settings` | Per-user NVIDIA NIM API key, model, base URL, Stripe webhook secret |
| `contracts` | Uploaded contracts with raw text, status, risk score |
| `clause_flags` | Individual risk flags from contract scans |
| `contract_terms` | Extracted terms (payment, scope, deadlines, etc.) |
| `invoices` | Tracked invoices with status and overdue tracking |
| `email_drafts` | AI-generated follow-up emails |
| `clients` | Auto-maintained client summaries with risk levels |
| `client_communications` | Inbound/outbound client messages |
| `payment_promises` | Tracked promises with status (pending/fulfilled/missed) |
| `ai_insights` | AI-generated risk assessments and recommendations |
| `webhook_events` | Inbound Stripe webhook event log |
| `activity_log` | System-wide event log |

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Supabase project (already provisioned in this environment)
- An NVIDIA NIM API key (get one free at [build.nvidia.com](https://build.nvidia.com))

### Installation

```bash
npm install
```

### Environment Variables

The `.env` file is pre-populated with Supabase credentials:

```
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

No additional environment variables are required to start. The NVIDIA NIM API key and Stripe webhook secret are configured per-user from the Account page and stored in the database.

### Running the Frontend

The dev server starts automatically. To run it manually:

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

### Building for Production

```bash
npm run build
```

Output is in `dist/`. Preview the production build:

```bash
npm run preview
```

### Database Migrations

Migrations are already applied to the provisioned Supabase project. To check the current state:

```sql
SELECT * FROM supabase_migrations.schema_migrations ORDER BY version;
```

If you need to re-apply the schema, the migration files are in `supabase/migrations/`.

### Edge Functions

All 5 edge functions are deployed and active:

| Function | Purpose | JWT Required |
|----------|---------|:------------:|
| `ai-contract-scan` | Scan contracts for predatory clauses | Yes |
| `ai-analyze` | Analyze client risk from data | Yes |
| `ai-chat` | Answer business questions with full context | Yes |
| `ai-draft-email` | Draft follow-up and scope defense emails | Yes |
| `stripe-webhook` | Process Stripe webhook events | No |

To redeploy an edge function, the source files are in `supabase/functions/<slug>/index.ts`.

## Configuration

### NVIDIA NIM API Key

1. Sign up at [build.nvidia.com](https://build.nvidia.com) and get an API key
2. Open the app and sign in
3. Go to **Account** → **AI & Integrations**
4. Paste your API key, optionally customize the model and base URL
5. Click **Save settings**

The default model is `nvidia/nemotron-3-nano-30b-a3b`. You can change it to any model available on NVIDIA NIM.

If no per-user key is configured, the edge functions fall back to a server-side `NVIDIA_NIM_API_KEY` environment variable (if set as an edge function secret).

### Stripe Webhook

1. Set up a Stripe webhook endpoint pointing to:
   ```
   https://<your-supabase-url>/functions/v1/stripe-webhook
   ```
2. Copy the signing secret (starts with `whsec_`)
3. Go to **Account** → **AI & Integrations** → **Stripe Webhook Secret**
4. Paste the secret and save

The webhook handler processes `invoice.payment_overdue` and `charge.dispute.created` events, marks invoices as overdue, and logs the event.

## Usage Guide

### First-Time Setup

1. **Create an account** — Sign up with email and password
2. **Configure AI** — Add your NVIDIA NIM API key in Account settings
3. **Upload a contract** — Go to Contract Scanner, drag a PDF or text file
4. **Review the audit** — See flagged risks, plain-English explanations, and extracted terms
5. **Add invoices** — Invoices linked to contracts appear in the Invoices view
6. **Track clients** — Client profiles are auto-created from contracts and invoices
7. **Ask questions** — Use "Ask My Business" to query your data in natural language

### Daily Workflow

1. **Check the Dashboard** for overdue invoices and high-risk clients
2. **Draft follow-up emails** for overdue invoices using the AI email drafter
3. **Analyze client communications** to detect payment promises and risk signals
4. **Track promises** in the Promises view — mark fulfilled or missed
5. **Defend scope** when clients request changes beyond the contract

## Security

- **Row-Level Security (RLS)** is enabled on every table — users can only access their own data
- **Auth-gated edge functions** — all AI functions require a valid JWT
- **Per-user API keys** — NVIDIA NIM keys are stored per-user with RLS protection
- **SECURITY DEFINER functions** have EXECUTE revoked from anon and authenticated roles
- **No demo data** — new accounts start clean

## License

This is a private project. All rights reserved.
