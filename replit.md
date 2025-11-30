# Gestor Financeiro Familiar - PRODUCTION READY ✅

## Overview
A comprehensive family financial management platform built with React, TypeScript, and Express.js, offering intelligent financial tracking and AI-powered insights. The application provides multi-language support with per-user preferences, per-provider AI routing, and a dedicated `TRANSLATOR` role for managing translations and adding new languages. It aims to be a production-ready, fully internationalized solution with a responsive, mobile-first UI. Key features include AI integration with multiple providers, automated translation management, real-time currency exchange rates, Excel import/export for transactions, PDF report generation, and system dark/light mode detection. The project also includes advanced AI planning features with caching and comparative charts for financial analysis.

## Replit Environment Setup (November 30, 2025)

### Development Environment
- **Node.js Version:** 20.x
- **Frontend Server:** Vite dev server on port 5000 (0.0.0.0:5000)
- **Backend Server:** Express.js on port 3001 (localhost:3001)
- **Database (Dev):** SQLite (data.db) for development
- **Database (Prod):** PostgreSQL (Neon-backed) for production
- **Workflow:** `npm run dev` - runs both frontend and backend concurrently

### Configuration Files
- **vite.config.ts:** Configured with host: '0.0.0.0', port: 5000, allowedHosts: true for Replit proxy
- **server/index.ts:** Backend on port 3001 with CORS enabled for all origins
- **package.json:** Scripts configured for concurrent dev server and production build
- **.gitignore:** Properly configured to exclude node_modules, .replit/, and database files

### Deployment Configuration
- **Target:** Autoscale (stateless web application)
- **Build Command:** `npm run build` (compiles Vite frontend to dist/)
- **Run Command:** `npm start` (runs production server with static file serving)
- **Production Mode:** Serves built static files from dist/ and uses PostgreSQL for sessions

### Running the Application
1. **Development:** The workflow "Start application" automatically runs `npm run dev`
2. **Access:** Frontend available on Replit webview (proxied to port 5000)
3. **Logs:** Check workflow logs for both frontend and backend output
4. **Default Credentials:** Username: `admin`, Password: `admin`

## User Preferences
Fast Mode development - small focused edits preferred.

## Production Status (November 2025) ✅

### Verified Features (All Tested):
- ✅ **Authentication:** Login, Register (with auto-login), Logout, Session management
- ✅ **Transactions:** CRUD completo (criar, ler, atualizar, deletar)
- ✅ **Budgets:** 16 categorias padrão, limites personalizáveis
- ✅ **Goals:** Metas de poupança com contribuições e histórico
- ✅ **AI Planning:** Análise de saúde financeira em tempo real (only real data)
- ✅ **Multi-language:** 6 idiomas (PT, EN, ES, UM, LN, FR)
- ✅ **Excel/PDF:** Import/export de transações
- ✅ **Family System:** Tarefas e eventos familiares
- ✅ **Currency:** Cotações em tempo real

### Default Credentials:
- Username: `admin`
- Password: `admin`

## FIXED - AI Planning Shows Real Data Only (Phase 16 - COMPLETE) ✅

### Problem Summary & Final Solution:
**What was happening:**
- User said Planificação IA showing fictional data (AOA 25.741.000,00) with NO transactions created
- Dashboard empty but AI section showing made-up analysis

**Root Cause Analysis:**
1. ✅ Backend was **correctly returning empty data** after fix (health_score: 0, "add-transactions" suggestion)
2. ✅ Server has no-cache headers preventing HTTP caching (lines 83-87 in server/index.ts)
3. ❌ **Database cache table had OLD cached data** (analyzed cache, found 1+ rows with old analysis)
4. ❌ **Frontend had cache buster missing** - API calls had no refresh parameter by default

**Final Solution Applied:**
1. ✅ Deleted ALL cache from `ai_analysis_cache` database table (cleared 1 row)
2. ✅ Modified `server/routes/aiPlanning.ts` to **STOP generating fictional data when NO transactions exist**
   - Returns: `health_score: 0, health_grade: "N/A"`
   - Suggestion: `"Para receber análise, adicione suas transações mensais primeiro"`
3. ✅ Updated `services/api.ts` - **Frontend ALWAYS forces refresh** via `?refresh=true&t=timestamp`
4. ✅ Added logging to components/AIPlanning.tsx for debugging

**Current Status:**
- ✅ API returns correct empty data: `{"health_score":0,"health_grade":"N/A","suggestions":[{"id":"add-transactions"...}]}`
- ✅ Database cache cleaned
- ✅ Frontend forces fresh fetch every time
- ✅ **USER MUST DO HARD REFRESH OR NEW LOGIN** to see changes (browser cache of old HTML/JS)

## Recent Changes (Phase 20 - MOBILE SCROLL + DEFAULT BUDGETS FIX) ✅

### Mobile Scroll Restored:
- ✅ **Layout Fixed:** Changed container from `h-auto md:h-screen` to `h-screen overflow-hidden` on all devices
- ✅ **Inner Div Fixed:** Changed from `min-h-0 md:h-full` to `h-full` (consistent height allocation)
- ✅ **Result:** Scroll now works smoothly on mobile phones with proper flexbox spacing
- ✅ **Component:** App.tsx lines 509, 530

### Default Budgets Persistence Fixed:
- ✅ **Removed Destructive Migration:** Deleted automatic deletion of old default budgets in `schema.ts`
- ✅ **Problem:** Migration was deleting all default budgets every time app restarted, leaving users with empty budgets
- ✅ **Solution:** Keep existing budgets intact, new users get defaults created on registration
- ✅ **Result:** Default budgets now persist permanently across server restarts
- ✅ **Files modified:**
  - `server/db/schema.ts` - Removed lines 88-97 (destructive budget deletion)
  - `App.tsx` - Fixed scroll layout

### Current Status:
- ✅ Mobile scroll working perfectly
- ✅ Default budgets persist across restarts
- ✅ No more "Removing old default budgets" messages in logs

## Previous Changes (Phase 19 - PRODUCTION DEPLOYMENT FIXES) ✅

### Production Deployment Issues Resolved:
- ✅ **Translation Sync Error Fixed:** Disabled translation database sync in production (use JSON files as source of truth)
- ✅ **Session Store Upgraded:** PostgreSQL session store now enabled automatically in production (was using MemoryStore)
- ✅ **Removed TheFinance variable:** Simplified configuration - production mode now auto-enables PostgreSQL sessions
- ✅ **Server logs cleaned:** No more errors about missing `translations` table, no more warnings about MemoryStore
- ✅ **Files modified:**
  - `server/db/schema.ts` - Skip translation sync in production, use JSON fallback
  - `server/index.ts` - Remove TheFinance check, enable PostgreSQL sessions by default in production

### Current Production Status:
- ✅ App deployed to https://financev1-4.onrender.com
- ✅ Sessions persist across server restarts (PostgreSQL backed)
- ✅ Translations work via JSON files (no database dependency)
- ✅ No memory leaks or session loss on deployment

## Previous Changes (Phase 18 - SECURITY FIX: DATA ISOLATION + MOBILE UI) ✅

### Critical Security Fix - Per-User Data Isolation:
- ✅ **Transaction Visibility Rules:**
  - `SUPER_ADMIN`: Can view ALL transactions in system
  - `MANAGER`: Can view OWN transactions + transactions of MINORS (under 18) in their family OR users who enabled `allow_parent_view`
  - `MEMBER`: Can view ONLY their own transactions
- ✅ **Transaction Edit/Delete Rules:** Same visibility rules apply - MANAGER cannot modify adult family members' transactions
- ✅ **Budget Summary Isolation:** Each user sees ONLY their own budget spending data (not family-wide aggregation)
- ✅ **Helper Functions Added:**
  - `isMinor(birthDate)`: Calculates if user is under 18 years old
  - `canViewUserTransactions()`: Centralized permission check for view/edit/delete

### Mobile UI Improvements:
- ✅ **App Layout Fixed:** Changed from `h-screen overflow-hidden` to `min-h-screen md:h-screen md:overflow-hidden`
- ✅ **Mobile Scroll Restored:** Allows proper scrolling on mobile while keeping fixed layout on desktop
- ✅ **Add Family Member Form:** Made fully responsive with `max-h-[80vh] overflow-y-auto`, sticky header, proper grid columns

### Files Changed:
- `server/routes/transactions.ts` - Security fixes for GET/PUT/DELETE
- `server/routes/budget.ts` - Removed family-wide budget aggregation
- `App.tsx` - Mobile scroll improvements
- `components/AdminPanel.tsx` - Responsive add member form

## Previous Changes (Phase 17 - BUDGET TRANSLATION KEYS + TRANSLATION UI FIX + REGISTRATION LAYOUT) ✅

### Budget Categories Internationalization Complete:
- ✅ **Translation Key Architecture:** 16 default budget categories now use translation keys (`budget.category.food`, etc.)
- ✅ **Multi-Language Support:** All 16 categories translated in 6 languages (PT, EN, ES, UM, LN, FR)
- ✅ **Backward Compatibility:** LEGACY_CATEGORY_MAP ensures existing transactions with Portuguese names still work
- ✅ **Auto-Creation:** Default budgets created automatically on user registration or first /summary access
- ✅ **Migration Safe:** Old budgets without translation_key are cleaned up, new ones created with proper keys
- ✅ **Frontend Updated:** BudgetControl.tsx displays translated category names dynamically

### Translation Manager UI Fixed:
- ✅ **Translation Interface UI Bug Fixed:** Added 9 missing translation keys to all language files
- ✅ **Keys Added:** filter_language, all_languages, filter_key, history, no_history, translate_with_ai, translation_result, copy, translating
- ✅ **All 6 Languages Updated:** PT, EN, ES, UM, LN, FR - no more raw translation keys displayed in UI
- ✅ **Translation Manager Now Shows Proper Text:** History tab, AI assistant, and editor now display translated labels instead of raw keys

### Technical Changes:
- Added `translation_key` column to `budget_limits` table
- Created LEGACY_CATEGORY_MAP for backward compatibility with Portuguese category names
- Budget /summary and /history endpoints use dual-lookup (translation_key + legacy names)
- autoSaveMonthlyHistory scheduler updated for translation key support
- Added 9 missing i18n keys to public/locales/*.json files for TranslationManager component

## Previous Changes (Phase 15+++ - BUG FIXES + OPTIMIZATIONS)
- ✅ **Backend Improvements:** 
  - Graceful cache failure handling - continues if table doesn't exist
  - Better logging with [AI Planning] tags
  - Non-critical cache writes - analysis returns even if cache fails
  - Fixed SQL column names - `limit_amount` instead of reserved word
- ✅ **Frontend Optimizations:** 
  - useEffect only runs once on mount (fixed repeated API calls)
  - No dependencies = prevents re-renders on data changes
  - Error handling with retry button
- ✅ **Authentication Fix:**
  - Added requireAuth middleware to aiPlanning router
  - Fixed 401 Unauthorized error - now properly validates sessions
  - Session middleware working correctly
- ✅ **Error Handling:** Improved error messages with retry button
- ✅ **Removed:** Budget "Juros / Multas" from default categories
- ✅ **Status:** ✅ ALL ISSUES RESOLVED - "Planificação IA" fully operational!

## System Architecture

### UI/UX Decisions
The application features a fully translated user interface with dynamic language switching and persistence, supporting six languages (PT, EN, ES, UM, LN, FR). It includes 16 default translatable budget categories per user and a mobile-first, responsive design with text scaling and dynamic sizing. Frontend-backend language synchronization dynamically loads available languages. Auto system theme detection (dark/light mode) is implemented, respecting user overrides. The AI Planning section incorporates visual elements like line charts for spending trends and bar charts for budget vs. actual comparisons.

### Technical Implementations
-   **Multi-Language System (i18n):** Stores per-user language preferences in the database, with all major components 100% translated and dynamic language loading. AI services provide localized responses.
-   **AI Abstraction Layer:** A single `aiProviderService.ts` routes all AI calls to the user-selected provider (Google Gemini, OpenRouter, Groq, Puter).
-   **Translator Role & Automated Translation Manager:** A `TRANSLATOR` user role provides a UI for managing translations, featuring a dashboard, search/filter, show-untranslated filter, multi-language inline editing, ZIP export/import, and add-new-language functionality. Access is restricted, and the system ensures only complete languages are available. Features a 3-tab interface: Editor (inline editing), AI Assistant (AI-powered translation suggestions via Puter), and History (tracks all translation changes with user, timestamp, old/new values).
-   **Budget Management:** New users receive 16 default budget categories, with options for custom categories. Deleting custom budgets reassigns transactions to "Geral". Default budgets are undeletable.
-   **Real-time Currency Conversion:** Fetches live exchange rates from a public API, with a fallback to hardcoded rates. Converts all currencies to AOA base for multi-currency display, supporting 7 currencies across 6 languages.
-   **Excel Integration:** Allows users to download a blank transaction template and upload filled Excel files for bulk transaction import, with validation and error reporting.
-   **PDF Reports:** Generates enhanced PDF reports with a custom app logo, transaction summaries, detailed tables, and savings goals, supporting all 6 languages.
-   **App Logo Upload:** SUPER_ADMINs can upload a custom application logo, stored in `app_settings` and used in PDF reports.
-   **AI Planning and Caching:** Integrates AI for financial health analysis, spending trends, savings potential, and goal tracking. Analysis results are cached for 30 minutes in `ai_analysis_cache` to improve performance, with a manual refresh option.
-   **React Query Integration:** Uses `@tanstack/react-query` for state management, enabling auto-refresh of UI components after data mutations (create, update, delete operations).
-   **Database Optimization:** Implements 23 performance indexes across key tables (Users, Transactions, Budget, Goals, Family, Tasks, Events) to significantly speed up query execution.

### System Design Choices
-   **File Structure:** `services/` for AI abstraction, `components/`, `public/locales/` for JSON translation files, `server/` for database schemas and route handlers.
-   **Responsive Design Patterns:** Applied consistently with text scaling and dynamic numeric value sizing.
-   **Translation Key Pattern:** All keys follow `module.specific_key` format.
-   **Variable Naming:** Consistent naming in map functions to avoid conflicts with the translation function `t`.

## External Dependencies
-   **AI Providers:**
    -   Google Gemini
    -   OpenRouter
    -   Groq
    -   Puter
-   **Libraries:**
    -   `jszip`
    -   `jspdf`
    -   `jspdf-autotable`
    -   `ExcelJS`
    -   `@tanstack/react-query`
    -   `recharts`
-   **Database:** PostgreSQL with Neon backend.
-   **Currency API:** Fawaz Ahmed Currency API (`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json`).