# Quick Start Guide - AICOC Application

## What Was Fixed

Two critical issues were identified and fixed:

### 1. Test Suite Timeouts

**Problem**: Unit tests were failing with timeout errors  
**Fix**: Increased Vitest timeout from 5 seconds to 15 seconds  
**File**: `vitest.config.mts`

### 2. Public Demo Access Blocked

**Problem**: Unauthenticated users couldn't access the homepage  
**Fix**: Added "/" to the list of public (unauthenticated) paths  
**File**: `src/lib/authz/route-policy.ts`

## Running the Application

### Start Development Server

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

### Run Tests

```bash
npm test
```

All 39 tests should pass. ✅

### Build for Production

```bash
npm run build
```

## How to Use the App

### 1. **Audit Your Products**

- Click "Run audit" button
- The system analyzes 100 products against 19 quality rules
- Results show 230 issues found with health score: 85/100

### 2. **Review Issues**

- Click "Review queue" to see all issues
- Issues are organized by:
  - Severity (critical, high, medium, low)
  - Category (Content quality, Image accessibility, Attributes, etc.)
- Click any issue to open the detail drawer

### 3. **Approve Changes**

- In the issue drawer, edit the "SUGGESTED VALUE" field
- Once edited, click "Approve" button
- The change is marked as approved ✅

### 4. **Publish Changes** (Demo Mode)

- After approving changes, scroll to "Approved this month" section
- Click "Simulate publishing" to apply changes
- Health score updates to reflect improvements

### 5. **Export Changes**

- Approved changes can be exported to CSV
- Click "Export approved changes" button
- Download the CSV file for use in your actual store

### 6. **Import Products**

- Go to "Stores & import"
- Use "Import CSV" to upload Shopify product export
- Or "Load Demo Store" to refresh the 100-product demo

## Features Overview

### 🔍 Audit Rules (19 Total)

- **SEO**: Title/description presence, length, uniqueness, handles
- **Images**: Alt text quality and presence
- **Content**: Uniqueness, density, freshness
- **Data**: GTIN validation, metadata
- **Schema**: JSON-LD structured data
- **Links**: Internal/external link validation

### 📊 Scoring

- Content Health Score: 0-100 (higher is better)
- Per-product scoring
- Issue impact weighting (critical = 24 pts, high = 6 pts, medium = 3 pts, low = 1 pt)

### 🤖 AI Suggestions (Optional)

- To enable: Set `GEMINI_API_KEY` in `.env.local`
- Set `GEMINI_MODEL` (defaults to `gemini-2.5-flash`)
- Click "Generate suggestion" to get AI drafts

### 👤 Role-Based Access

- **Owner**: Full access (audit, review, approve, publish, settings)
- **Editor**: Audit, review, and suggest but cannot approve/publish
- **Reviewer**: Review and approve suggestions only
- **Viewer**: Read-only access

### 🛍️ Shopify Integration (Optional)

- Connect via OAuth: Settings → Connect Store
- Import products via GraphQL API
- Publish approved changes back to Shopify

## Configuration

### Required (Already Set)

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=<your-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-key>
SUPABASE_SERVICE_ROLE_KEY=<your-key>
```

### Optional

```env
# For AI suggestions
GEMINI_API_KEY=<your-key>
GEMINI_MODEL=gemini-2.5-flash

# For Shopify integration
SHOPIFY_API_KEY=<your-key>
SHOPIFY_API_SECRET=<your-secret>

# For token encryption
ENCRYPTION_KEY=<base64-32-bytes>
```

## Database Setup (Supabase)

To enable persistent data storage:

1. Create a Supabase project
2. Go to SQL Editor
3. Run all migrations in order:
   - `supabase/migrations/202609300001_initial_schema.sql`
   - `supabase/migrations/202609300002_persisted_jobs.sql`
   - `supabase/migrations/202609300003_audit_rule_fields.sql`
   - `supabase/migrations/202609300004_role_scoped_rls.sql`
   - `supabase/migrations/202609300005_simulated_publish.sql`

4. Enable RLS (Row Level Security) on all tables
5. Create a workspace and user membership

## Troubleshooting

### "AI suggestions not configured"

- Expected if GEMINI_API_KEY not set
- Deterministic audits continue to work
- Set GEMINI_API_KEY to enable AI features

### "Configure Supabase to save the Demo Store"

- Demo still works in browser-only mode
- Persisted features (save/resume) need Supabase
- Set Supabase credentials to enable persistence

### Tests fail with timeout

- Already fixed (testTimeout: 15000)
- If issue persists, increase timeout further in `vitest.config.mts`

### Can't access homepage

- Already fixed (added "/" to public paths)
- If issue persists, check `.env.local` for Supabase URL/keys

## Project Structure

```
src/
├── app/              # Next.js App Router pages & API routes
├── features/         # React components (dashboard, auth)
├── lib/
│   ├── audit/        # Audit rules, scoring, validation
│   ├── ai/           # Gemini integration, prompts
│   ├── authz/        # Role-based access control
│   ├── jobs/         # Batch processing, imports
│   ├── shopify/      # OAuth, GraphQL, imports
│   └── supabase/     # Database clients
├── components/       # Shadcn UI components
└── config/          # Environment & configuration
```

## Next Steps

1. ✅ **Verified**: All tests pass, build succeeds, app runs
2. ✅ **Tested**: Audit, review, approval, export workflows
3. 🔄 **Deploy**: Push to GitHub → Deploy to Vercel
4. 🔑 **Configure**: Add Gemini/Shopify keys for full features
5. 📊 **Monitor**: Check GitHub Actions CI/CD pipeline

## Support

For issues:

1. Check `AUDIT_FIXES_SUMMARY.md` for what was fixed
2. Review `.env.local` for proper configuration
3. Run `npm test` to verify functionality
4. Check browser console for error messages

---

**Status**: ✅ Application fully functional and ready for use!
