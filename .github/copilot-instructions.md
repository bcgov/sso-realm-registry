# Copilot Instructions for `sso-realm-registry`

## Build, test, and lint commands

### Repository-level setup and checks

- Install toolchain and pre-commit dependencies from repo root:
  - `make local-setup`
- Run repository pre-commit checks from repo root:
  - `pre-commit run --all-files`

### App (`app/`) commands

- Install deps:
  - `cd app && yarn`
- Run dev server:
  - `cd app && yarn dev`
- Build production bundle:
  - `cd app && yarn build`
- Run lint:
  - `cd app && yarn lint`
- Run full test suite:
  - `cd app && yarn test`
- Run a single test file:
  - `cd app && yarn test __tests__/api/update-realm.test.ts`
- Run a single test case by name:
  - `cd app && yarn test -t "Only allows admins to update expected fields"`

### Local DB bootstrap (for local development)

- App README flow:
  - `cd app/db && pg_ctl start && ./setup.sh`

## High-level architecture

- This is a **Next.js Pages Router** app in `app/` with UI pages (for example `pages/my-dashboard.tsx`, `pages/custom-realm-dashboard.tsx`, `pages/realm/[rid].tsx`) and API routes under `pages/api/**`.
- Authentication is centralized in `pages/api/auth/[...nextauth].ts` using **NextAuth + Keycloak**. Most protected API routes call `getServerSession(..., authOptions)` and gate behavior by authenticated user and role (`sso-admin`).
- UI data access goes through `app/services/*` wrappers (Axios base `/api`) rather than direct fetch calls from pages/components.
- Primary data persistence is PostgreSQL through **Prisma** (`utils/prisma.ts`, `prisma/schema.prisma`), mainly:
  - `Roster` (`rosters` table): custom realm request/profile lifecycle.
  - `Event` (`events` table): audit/event timeline per realm request.
- Realm lifecycle operations fan out across systems:
  - DB updates in Prisma
  - Keycloak realm/admin operations via `controllers/keycloak.ts` and `utils/keycloak-core.ts`
  - Notifications via `utils/mailer.ts`
  - Event logging via `createEvent(...)`
- External integration API routes include:
  - Azure Graph lookups (`pages/api/azure-service/*`, `controllers/msal.ts`)
  - BCEID/IDIR SOAP service proxy (`pages/api/bceid-service/*`, `utils/idir.ts`)
- Admin dashboard logic includes multi-environment realm sync checks (`dev/test/prod`) by comparing roster rows with Keycloak realms (`pages/api/realms.ts`).

## Key codebase conventions

- **Tuple-style service returns**: client service functions return `[data, null] | [null, err]` (see `services/realm.ts`, `services/user.ts`, `services/meta.ts`). Keep this pattern when adding service functions.
- **Role-based field control is centralized**:
  - Validation schema per role via `getUpdateRealmSchemaByRole(...)` in `validators/create-realm.ts`
  - Allowed/hidden field helpers in `utils/helpers.ts` (`allowed*Fields`, `adminOnlyFields`)
  - Non-admin responses commonly strip admin-only fields using `omit(..., adminOnlyFields)`.
- **Realm names are normalized** to kebab-case before creation (`kebabCase(data.realm)` in `pages/api/realms.ts`) and uniqueness is checked against both DB and Keycloak.
- **Status/event enums are source-of-truth** in `validators/create-realm.ts` (`StatusEnum`, `EventEnum`); use them instead of hard-coded strings when extending workflow behavior.
- **Audit/event recording is expected** on mutation paths (`createEvent(...)` on create/update/approve/reject/delete/restore flows).
- **Absolute imports are standard** within `app/` (`baseUrl: "."` in `tsconfig.json`), e.g. `import prisma from 'utils/prisma'`.
- **Tests live in `app/__tests__`** and heavily mock `next-auth`, Prisma, and integration layers; follow that style for API route tests.
- **Auth exception**: `pages/api/users/[id].ts` is machine-authenticated with `API_AUTH_SECRET` header rather than NextAuth session.
