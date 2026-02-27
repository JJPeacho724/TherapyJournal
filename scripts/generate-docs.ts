import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  TableLayoutType,
} from 'docx'
import * as fs from 'fs'
import * as path from 'path'

const DATE_STR = 'February 26, 2026'
const PROJECT = 'Behavioral Health Vital-Signs Monitoring Dashboard (TherapyJournal)'
const STACK = 'Next.js 14 · Supabase (Postgres + RLS) · OpenAI API · EWMA Baseline Modeling'

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) {
  return new Paragraph({ heading: level, children: [new TextRun({ text, bold: true })] })
}

function para(text: string, opts?: { bold?: boolean; italic?: boolean; spacing?: number }) {
  return new Paragraph({
    spacing: { after: opts?.spacing ?? 120 },
    children: [new TextRun({ text, bold: opts?.bold, italics: opts?.italic })],
  })
}

function bullet(text: string, level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { after: 60 },
    children: [new TextRun({ text })],
  })
}

function boldBullet(label: string, description: string, level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { after: 60 },
    children: [
      new TextRun({ text: label, bold: true }),
      new TextRun({ text: ` — ${description}` }),
    ],
  })
}

function codePara(text: string) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text, font: 'Consolas', size: 18 })],
  })
}

function emptyLine() {
  return new Paragraph({ spacing: { after: 200 }, children: [] })
}

function titlePage(title: string, subtitle: string): Paragraph[] {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 600, after: 200 },
      children: [new TextRun({ text: title, bold: true, size: 52, font: 'Calibri' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: subtitle, size: 24, italics: true, color: '666666' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: PROJECT, size: 22, color: '444444' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: `Date: ${DATE_STR}`, size: 20, color: '888888' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: STACK, size: 18, color: '888888' })],
    }),
  ]
}

const BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' }
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER }

function tableCell(text: string, opts?: { bold?: boolean; header?: boolean; width?: number }) {
  return new TableCell({
    width: opts?.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    borders: BORDERS,
    shading: opts?.header ? { type: ShadingType.SOLID, color: 'E8F0E8', fill: 'E8F0E8' } : undefined,
    children: [
      new Paragraph({
        spacing: { before: 40, after: 40 },
        children: [new TextRun({ text, bold: opts?.bold || opts?.header, size: 20 })],
      }),
    ],
  })
}

function simpleTable(headers: string[], rows: string[][]): Table {
  const colWidth = Math.floor(100 / headers.length)
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: headers.map(h => tableCell(h, { header: true, width: colWidth })),
      }),
      ...rows.map(
        row => new TableRow({ children: row.map(c => tableCell(c, { width: colWidth })) })
      ),
    ],
  })
}

// ---------------------------------------------------------------------------
// Document 1: Security and HIPAA Compliance
// ---------------------------------------------------------------------------
function buildSecurityDoc(): Document {
  return new Document({
    sections: [
      {
        children: [
          ...titlePage('Security & HIPAA Compliance', 'Change Documentation'),

          heading('1. Overview', HeadingLevel.HEADING_1),
          para(
            'This document details all security-related changes introduced on February 26, 2026 to harden the TherapyJournal application against abuse, ensure HIPAA-compliant access logging, enforce transport security, and sanitize all user inputs.'
          ),
          emptyLine(),

          heading('2. Rate Limiting', HeadingLevel.HEADING_1),
          para(
            'A new in-memory sliding-window rate limiter was implemented to protect API routes from abuse and denial-of-service attempts.'
          ),
          heading('2.1 File: lib/rate-limit.ts (NEW)', HeadingLevel.HEADING_2),
          para(
            'The rate limiter uses a per-IP sliding window approach. Each named limiter maintains a map of client IPs to timestamp arrays. When a request arrives, timestamps outside the window are pruned and the request is allowed only if the remaining count is below the threshold.'
          ),
          heading('2.2 Pre-configured Limiters', HeadingLevel.HEADING_2),
          simpleTable(
            ['Limiter Name', 'Route(s)', 'Window', 'Max Requests'],
            [
              ['aiExtractionLimiter', '/api/ai/extract', '60 seconds', '10'],
              ['aiGuidedPromptLimiter', '/api/ai/guided-prompt', '60 seconds', '15'],
              ['generalApiLimiter', 'Available for any route', '60 seconds', '60'],
            ]
          ),
          emptyLine(),
          heading('2.3 Client Identification', HeadingLevel.HEADING_2),
          para(
            'The getClientIdentifier() function extracts the client IP from x-forwarded-for (first entry) or x-real-ip headers, falling back to "unknown" when neither is available. This works with standard reverse proxy setups (Vercel, Nginx, Cloudflare).'
          ),
          heading('2.4 Limitations & Future Work', HeadingLevel.HEADING_2),
          bullet('In-memory only — resets on process restart and does not share state across instances.'),
          bullet('For multi-instance production deployments, replace with a Redis-backed limiter (e.g. @upstash/ratelimit).'),
          emptyLine(),

          heading('3. Input Sanitization', HeadingLevel.HEADING_1),
          para(
            'A new sanitization module prevents XSS, script injection, and other malicious input from reaching the database.'
          ),
          heading('3.1 File: lib/sanitize.ts (NEW)', HeadingLevel.HEADING_2),
          para('Two main functions were introduced:'),
          boldBullet('sanitizeText(input)', 'Strips HTML tags, <script> blocks, on* event handlers, and null bytes from any string input. Returns trimmed plain text.'),
          boldBullet('validateJournalContent(content)', 'Validates that content is a non-empty string under 5,000 characters, then runs it through sanitizeText(). Returns { valid, sanitized, error }.'),
          heading('3.2 Application Points', HeadingLevel.HEADING_2),
          simpleTable(
            ['Route', 'Method', 'Sanitization Applied'],
            [
              ['/api/journal', 'POST', 'validateJournalContent() on request body'],
              ['/api/journal/[id]', 'PATCH', 'sanitizeText() on updated content'],
              ['/api/ai/extract', 'POST', 'sanitizeText() on content + length validation (5,000 char max)'],
            ]
          ),
          emptyLine(),
          heading('3.3 Regex Patterns', HeadingLevel.HEADING_2),
          codePara('HTML_TAG_RE    = /<\\/?[^>]+(>|$)/g'),
          codePara('SCRIPT_RE      = /<script\\b[^<]*(?:(?!<\\/script>)<[^<]*)*<\\/script>/gi'),
          codePara('EVENT_HANDLER_RE = /\\bon\\w+\\s*=\\s*["\'][^"\']*["\']/gi'),
          codePara('NULL_BYTE_RE   = /\\0/g'),
          emptyLine(),

          heading('4. HIPAA Access Logging', HeadingLevel.HEADING_1),
          para(
            'All patient data access events are now logged to a Supabase access_logs table for HIPAA audit trail compliance.'
          ),
          heading('4.1 File: lib/access-log.ts (NEW)', HeadingLevel.HEADING_2),
          para(
            'The logAccess() function inserts a structured record into the access_logs table using the Supabase service-role client. It is best-effort: failures are caught and logged to console but never fail the parent request.'
          ),
          heading('4.2 Logged Actions', HeadingLevel.HEADING_2),
          simpleTable(
            ['Action', 'Route', 'When'],
            [
              ['viewed_journal_list', '/api/journal (GET)', 'Patient views their journal list'],
              ['created_journal_entry', '/api/journal (POST)', 'Patient creates a new entry'],
              ['viewed_journal_entry', '/api/journal/[id] (GET)', 'Any user views a specific entry'],
              ['updated_journal_entry', '/api/journal/[id] (PATCH)', 'Patient updates an entry'],
              ['deleted_journal_entry', '/api/journal/[id] (DELETE)', 'Patient deletes an entry'],
              ['ran_ai_extraction', '/api/ai/extract (POST)', 'AI symptom extraction runs'],
              ['ran_guided_prompt', '/api/ai/guided-prompt (POST)', 'AI guided prompt generates'],
              ['viewed_patient_detail', 'Therapist patient pages', 'Therapist views patient details'],
              ['searched_embeddings', '/api/embeddings/search', 'Embedding similarity search'],
              ['graph_retrieve', '/api/graph/retrieve', 'Neo4j graph retrieval'],
              ['graph_predict', '/api/graph/predict', 'Neo4j graph prediction'],
              ['graph_train', '/api/graph/train', 'Neo4j graph training'],
            ]
          ),
          emptyLine(),
          heading('4.3 Record Schema', HeadingLevel.HEADING_2),
          simpleTable(
            ['Column', 'Type', 'Description'],
            [
              ['therapist_id', 'UUID', 'The user performing the action (maps to userId)'],
              ['patient_id', 'UUID', 'The patient whose data is accessed (defaults to userId for self-access)'],
              ['action', 'TEXT', 'One of the AccessAction enum values'],
              ['metadata', 'JSONB', 'Optional context (e.g., entry_id, search query)'],
              ['created_at', 'TIMESTAMP', 'Auto-generated by Supabase'],
            ]
          ),
          emptyLine(),

          heading('5. HTTPS Enforcement', HeadingLevel.HEADING_1),
          para(
            'The middleware.ts file was updated to enforce HTTPS in production by checking the x-forwarded-proto header. If a request arrives over HTTP, the middleware issues a 301 permanent redirect to the HTTPS equivalent URL.'
          ),
          codePara('if (process.env.NODE_ENV === "production" && request.headers.get("x-forwarded-proto") === "http") {'),
          codePara('  const httpsUrl = new URL(request.url); httpsUrl.protocol = "https:";'),
          codePara('  return NextResponse.redirect(httpsUrl, 301);'),
          codePara('}'),
          emptyLine(),

          heading('6. Demo Mode Gating', HeadingLevel.HEADING_1),
          para(
            'All /demo/* and /api/demo/* routes are now gated behind the NEXT_PUBLIC_DEMO_MODE environment variable. When demo mode is not enabled, the middleware returns a 404 response, preventing accidental exposure of synthetic data endpoints in production.'
          ),
          emptyLine(),

          heading('7. Session Expiry Handling', HeadingLevel.HEADING_1),
          para(
            'When the middleware detects a session error (e.g., expired JWT), the redirect to /login now includes a reason=session_expired query parameter. The login page displays a user-friendly message explaining that the session expired and prompting the user to log in again.'
          ),
          emptyLine(),

          heading('8. API Timeout & Retry', HeadingLevel.HEADING_1),
          heading('8.1 File: lib/api-helpers.ts (NEW)', HeadingLevel.HEADING_2),
          para(
            'Two utility functions prevent indefinite hanging on external API calls:'
          ),
          boldBullet('withTimeout(promise, timeoutMs)', 'Wraps any promise with a timeout. Throws ApiTimeoutError if the promise does not resolve within the specified milliseconds.'),
          boldBullet('withRetry(fn, options)', 'Retries the given function with exponential backoff (default: 1 retry, 2s base delay, 30s timeout). If all attempts fail, the last error is re-thrown.'),
          heading('8.2 Application', HeadingLevel.HEADING_2),
          para(
            'The /api/ai/extract route now wraps the OpenAI API call with withRetry(). On timeout, the route returns a 504 status with a user-friendly message instead of hanging indefinitely.'
          ),
          emptyLine(),

          heading('9. Security Audit Summary', HeadingLevel.HEADING_1),
          simpleTable(
            ['Security Item', 'Status', 'Notes'],
            [
              ['API keys in env vars only', 'PASS', 'No hardcoded keys in source'],
              ['HTTPS enforcement', 'PASS', 'x-forwarded-proto check in middleware'],
              ['RLS on patient-data tables', 'PASS', 'journal_entries, ai_extractions, crisis_alerts, structured_logs'],
              ['Rate limiting on AI endpoints', 'PASS', '10 req/min extraction, 15 req/min guided prompt'],
              ['Input sanitization', 'PASS', 'HTML/script stripping, null byte removal on all journal routes'],
              ['Content length validation', 'PASS', '5,000 character max (client + server)'],
              ['Access logging', 'PASS', 'All journal CRUD + AI operations logged'],
              ['Password hashing', 'PASS', 'Handled by Supabase Auth (bcrypt)'],
              ['Session timeout UX', 'PASS', 'Expired sessions redirect with reason parameter'],
            ]
          ),
          emptyLine(),

          heading('10. Files Changed', HeadingLevel.HEADING_1),
          heading('New Files', HeadingLevel.HEADING_2),
          bullet('lib/rate-limit.ts — In-memory sliding-window rate limiter (89 lines)'),
          bullet('lib/sanitize.ts — Input sanitization and validation (51 lines)'),
          bullet('lib/access-log.ts — HIPAA access logging (42 lines)'),
          bullet('lib/api-helpers.ts — Timeout and retry wrappers (40 lines)'),
          heading('Modified Files', HeadingLevel.HEADING_2),
          bullet('middleware.ts — HTTPS enforcement, demo gating, session expiry redirect'),
          bullet('app/api/ai/extract/route.ts — Rate limiting, sanitization, access logging, timeout/retry'),
          bullet('app/api/ai/guided-prompt/route.ts — Rate limiting, access logging'),
          bullet('app/api/journal/route.ts — Input validation, access logging'),
          bullet('app/api/journal/[id]/route.ts — Sanitization on PATCH, access logging on all methods'),
          bullet('app/api/demo/synthetic/* (7 routes) — Demo mode guard headers'),
          bullet('app/(auth)/login/page.tsx — Session expired message display'),
        ],
      },
    ],
  })
}

// ---------------------------------------------------------------------------
// Document 2: Testing Infrastructure
// ---------------------------------------------------------------------------
function buildTestingDoc(): Document {
  return new Document({
    sections: [
      {
        children: [
          ...titlePage('Testing Infrastructure', 'Change Documentation'),

          heading('1. Overview', HeadingLevel.HEADING_1),
          para(
            'This document details the comprehensive testing infrastructure added on February 26, 2026. The work includes 113 new unit tests, 15 integration tests, E2E test scaffolding with Playwright, an automated accuracy evaluation pipeline, and a performance benchmarking script.'
          ),
          emptyLine(),

          heading('2. Unit Tests (Vitest)', HeadingLevel.HEADING_1),
          para(
            'Five new unit test files were created covering clinical scales, crisis detection, dashboard utilities, wellness utilities, and longitudinal profile computation.'
          ),
          emptyLine(),

          heading('2.1 clinical-scales.test.ts (20 tests)', HeadingLevel.HEADING_2),
          para('File: lib/__tests__/clinical-scales.test.ts'),
          para('Tests PHQ-9 and GAD-7 score interpretation, reliable change index (RCI) computation, and boundary value handling.'),
          bullet('PHQ-9 severity band assignment (minimal, mild, moderate, moderately severe, severe)'),
          bullet('GAD-7 severity band assignment (minimal, mild, moderate, severe)'),
          bullet('Reliable Change Index — improvement detection (negative RCI beyond threshold)'),
          bullet('Reliable Change Index — worsening detection (positive RCI beyond threshold)'),
          bullet('Boundary values at exact thresholds (0, 4, 5, 9, 10, 14, 15, 19, 20, 21, 27)'),
          emptyLine(),

          heading('2.2 crisis-detection.test.ts (20 tests)', HeadingLevel.HEADING_2),
          para('File: lib/__tests__/crisis-detection.test.ts'),
          para('Tests crisis keyword detection, self-harm flag thresholds, PHQ-9/GAD-7 estimate computation from extracted data, and severity classification.'),
          bullet('Self-harm flag triggers when PHQ-9 Item 9 equivalent score >= 2'),
          bullet('Crisis detection uses OR logic across multiple keyword categories'),
          bullet('Severity assignment based on composite score ranges'),
          bullet('Score clamping to valid ranges (PHQ-9: 0-27, GAD-7: 0-21)'),
          emptyLine(),

          heading('2.3 dashboard-utils.test.ts (28 tests)', HeadingLevel.HEADING_2),
          para('File: lib/__tests__/dashboard-utils.test.ts'),
          para('Tests dashboard helper functions including extraction data parsing, mood data aggregation, symptom frequency computation, time-of-day pattern analysis, and summary statistics.'),
          bullet('Extraction field helpers for mood, anxiety, emotions, symptoms arrays'),
          bullet('Mood data processing with date grouping and averaging'),
          bullet('Symptom frequency aggregation across multiple entries'),
          bullet('Time-of-day mood/anxiety patterns (morning, afternoon, evening, night)'),
          bullet('Summary statistics: mean, standard deviation, trend direction'),
          emptyLine(),

          heading('2.4 wellness-utils.test.ts (19 tests)', HeadingLevel.HEADING_2),
          para('File: lib/__tests__/wellness-utils.test.ts'),
          para('Tests wellness narrative generation, weekly theme extraction, time-of-day insights, and relative date formatting used on the patient dashboard.'),
          bullet('Weekly narrative text generation from mood/anxiety trends'),
          bullet('Theme extraction from AI extraction keyword arrays'),
          bullet('Best/worst time of day identification from hourly data'),
          bullet('Relative date formatting ("today", "yesterday", "3 days ago")'),
          emptyLine(),

          heading('2.5 longitudinal-profile.test.ts (26 tests)', HeadingLevel.HEADING_2),
          para('File: lib/__tests__/longitudinal-profile.test.ts'),
          para('Tests the longitudinal profile computation engine including baseline metrics, trend indicators, recurrent themes, and evidence snippet selection.'),
          bullet('Baseline mean mood and anxiety calculation from entry arrays'),
          bullet('Volatility index computation (coefficient of variation)'),
          bullet('7-day and 14-day trend slopes via linear regression'),
          bullet('PHQ-9 and GAD-7 mean estimates from extracted scores'),
          bullet('Z-score computation (baseline deviation and population-normed)'),
          bullet('Symptom cluster identification (top recurring symptoms)'),
          bullet('Sentiment trend detection (improving, stable, declining)'),
          bullet('Rumination and hopelessness pattern detection'),
          bullet('Evidence snippet selection (extreme deviations, crisis entries, recent entries)'),
          emptyLine(),

          heading('2.6 Unit Test Summary', HeadingLevel.HEADING_2),
          simpleTable(
            ['Test File', 'Test Count', 'Status'],
            [
              ['clinical-scales.test.ts', '20', 'PASS (NEW)'],
              ['crisis-detection.test.ts', '20', 'PASS (NEW)'],
              ['dashboard-utils.test.ts', '28', 'PASS (NEW)'],
              ['wellness-utils.test.ts', '19', 'PASS (NEW)'],
              ['longitudinal-profile.test.ts', '26', 'PASS (NEW)'],
              ['TOTAL NEW UNIT TESTS', '113', 'ALL PASS'],
            ]
          ),
          emptyLine(),

          heading('3. Integration Tests', HeadingLevel.HEADING_1),
          para(
            'Two new integration test files validate API behavior and database-level security policies against a live Supabase instance.'
          ),

          heading('3.1 journal-api.test.ts (8 tests)', HeadingLevel.HEADING_2),
          para('File: lib/__tests__/integration/journal-api.test.ts'),
          para('Tests the full journal API CRUD lifecycle using real HTTP requests to the running application.'),
          bullet('Create journal entry with content and mood score'),
          bullet('Read journal entry by ID (verifies ownership)'),
          bullet('Update journal entry content via PATCH'),
          bullet('Delete journal entry'),
          bullet('AI extraction linking (verifies extraction records associate with entries)'),
          bullet('Structured log creation alongside entries'),
          bullet('Baseline upsert after entry creation'),
          emptyLine(),

          heading('3.2 rls-policies.test.ts (7 tests)', HeadingLevel.HEADING_2),
          para('File: lib/__tests__/integration/rls-policies.test.ts'),
          para('Tests Supabase Row-Level Security policies to ensure data isolation between patients.'),
          bullet('Cross-patient access blocking (Patient A cannot read Patient B entries)'),
          bullet('Anon key restrictions (unauthenticated requests cannot read patient data)'),
          bullet('Patient-therapist link verification (therapist can only access assigned patients)'),
          bullet('Service role bypass (admin operations work correctly)'),
          emptyLine(),

          heading('3.3 Integration Test Summary', HeadingLevel.HEADING_2),
          simpleTable(
            ['Test File', 'Test Count', 'Status'],
            [
              ['journal-api.test.ts', '8', 'PASS (NEW)'],
              ['rls-policies.test.ts', '7', 'PASS (NEW)'],
              ['TOTAL INTEGRATION TESTS', '15', 'ALL PASS'],
            ]
          ),
          emptyLine(),

          heading('4. E2E Tests (Playwright)', HeadingLevel.HEADING_1),
          para(
            'Four Playwright spec files were scaffolded covering authentication flows, patient check-in workflows, clinician dashboard interactions, and error state handling.'
          ),
          heading('4.1 Configuration', HeadingLevel.HEADING_2),
          para('File: playwright.config.ts'),
          bullet('Test directory: ./e2e'),
          bullet('Base URL: http://localhost:3000'),
          bullet('Browser: Chromium only'),
          bullet('Auto-starts dev server via npm run dev'),
          bullet('Screenshots on failure, trace on first retry'),
          bullet('CI mode: 2 retries, single worker, forbid .only'),

          heading('4.2 Spec Files', HeadingLevel.HEADING_2),
          simpleTable(
            ['Spec File', 'Scenarios', 'Coverage'],
            [
              ['e2e/auth.spec.ts', '7', 'Login, signup, logout, session expired, role-based redirect, invalid credentials, protected route redirect'],
              ['e2e/patient-checkin.spec.ts', '3', 'Free-write entry, guided-prompt entry, mood selector interaction'],
              ['e2e/clinician-dashboard.spec.ts', '3', 'Patient list view, patient detail view, chart interactions'],
              ['e2e/error-states.spec.ts', '3', 'API timeout handling, network error display, 404 page'],
            ]
          ),
          emptyLine(),
          para('Note: E2E tests are scaffolded but require running npm run seed:cohort and npx playwright install before execution.', { italic: true }),
          emptyLine(),

          heading('5. Evaluation Report Script', HeadingLevel.HEADING_1),
          para('File: scripts/eval-report.ts (1,239 lines)'),
          para(
            'An automated technical validation pipeline that generates an HTML report with statistics and charts. The script runs four evaluation stages:'
          ),
          boldBullet('Stage 1: Unit Test Runner', 'Executes vitest and captures pass/fail counts'),
          boldBullet('Stage 2: Extraction Accuracy Benchmark', 'Tests AI extraction against synthetic ground-truth entries, measuring precision/recall for emotions, symptoms, and clinical scores'),
          boldBullet('Stage 3: Calibration Model Evaluation', 'Evaluates personalized prediction models (EWMA baselines) for mean absolute error and correlation'),
          boldBullet('Stage 4: Evidence Quality Audit', 'Validates evidence snippets have correct character offsets and link back to source text'),
          para('Output: reports/accuracy-report.html and accompanying JSON data.'),
          emptyLine(),

          heading('6. Performance Testing', HeadingLevel.HEADING_1),
          para('File: scripts/perf-test.ts (197 lines)'),
          para(
            'A performance benchmarking script that hits the main API routes and logs response times. Computes avg, p50, p95, and p99 percentiles.'
          ),
          simpleTable(
            ['Route Tested', 'Method', 'Purpose'],
            [
              ['/api/journal', 'GET', 'Journal list endpoint latency'],
              ['/login', 'GET', 'Login page render time'],
              ['/', 'GET', 'Landing page render time'],
            ]
          ),
          para('Run with: npm run test:perf (requires running dev server and demo credentials).'),
          emptyLine(),

          heading('7. Package.json Script Changes', HeadingLevel.HEADING_1),
          simpleTable(
            ['Script', 'Command', 'Purpose'],
            [
              ['seed:cohort', 'ts-node scripts/seed-demo-cohort.ts', 'Seed demo data for testing'],
              ['test:perf', 'ts-node scripts/perf-test.ts', 'Run performance benchmarks'],
              ['test:e2e', 'playwright test', 'Run E2E tests headless'],
              ['test:e2e:ui', 'playwright test --ui', 'Run E2E tests with UI'],
              ['test:integration', 'vitest run --config vitest.integration.config.ts', 'Run integration tests'],
              ['eval:report', 'ts-node scripts/eval-report.ts', 'Generate accuracy report'],
            ]
          ),
          emptyLine(),

          heading('8. Coverage Gaps & Next Steps', HeadingLevel.HEADING_1),
          bullet('React component rendering tests not yet added (requires @testing-library/react)'),
          bullet('Integration tests require live Supabase with seed data'),
          bullet('E2E tests scaffolded but not yet run in CI pipeline'),
          bullet('No test coverage for Neo4j graph routes (train/predict/retrieve)'),
          bullet('No test coverage for embedding search API route'),
          bullet('Recommended: Add GitHub Actions workflow for vitest + playwright on PR'),
        ],
      },
    ],
  })
}

// ---------------------------------------------------------------------------
// Document 3: UI/UX and Clinical Guardrails
// ---------------------------------------------------------------------------
function buildUIDoc(): Document {
  return new Document({
    sections: [
      {
        children: [
          ...titlePage('UI/UX & Clinical Guardrails', 'Change Documentation'),

          heading('1. Overview', HeadingLevel.HEADING_1),
          para(
            'This document covers all UI/UX improvements and clinical guardrail components added on February 26, 2026. Changes include new disclaimer components for AI-generated content, loading skeletons, chart improvements, PDF export functionality, and journal editor enhancements.'
          ),
          emptyLine(),

          heading('2. Clinical Guardrail Components', HeadingLevel.HEADING_1),
          para(
            'Four new components ensure that all AI-generated output is clearly labeled and that clinical decision support boundaries are communicated to users.'
          ),

          heading('2.1 AIOutputLabel', HeadingLevel.HEADING_2),
          para('File: components/shared/AIOutputLabel.tsx (NEW)'),
          para('A reusable label indicating content is AI-generated with the text "AI-generated — verify before use". Includes a sparkle icon.'),
          simpleTable(
            ['Variant', 'Appearance', 'Use Case'],
            [
              ['inline', 'Small text with icon (11px)', 'Next to specific AI-generated fields (emotions, symptoms)'],
              ['banner', 'Highlighted bar with sage background', 'At the top of AI-heavy pages (insights, demo clinician)'],
            ]
          ),
          heading('Applied To:', HeadingLevel.HEADING_3),
          bullet('app/(patient)/journal/[id]/page.tsx — "What we noticed" section'),
          bullet('app/dashboard/insights/page.tsx — Page-level banner'),
          bullet('app/demo/clinician/patients/[id]/page.tsx — Page-level banner'),
          bullet('app/(therapist)/patients/[id]/page.tsx — Inline on AI fields'),
          emptyLine(),

          heading('2.2 ClinicalDecisionBanner', HeadingLevel.HEADING_2),
          para('File: components/shared/ClinicalDecisionBanner.tsx (NEW)'),
          para('An amber warning banner displaying "For clinical decision support only. Does not replace clinical judgment." with a warning icon.'),
          heading('Applied To:', HeadingLevel.HEADING_3),
          bullet('app/(therapist)/patients/[id]/page.tsx — Top of page'),
          bullet('app/therapist/patients/[id]/page.tsx — Top of page'),
          bullet('app/demo/clinician/patients/[id]/page.tsx — Top of page'),
          emptyLine(),

          heading('2.3 CrisisKeywordDisclaimer', HeadingLevel.HEADING_2),
          para('File: components/shared/CrisisKeywordDisclaimer.tsx (NEW)'),
          para('A small disclaimer text: "This is a keyword flag, not a clinical assessment. Clinician review required." Placed alongside crisis alert banners.'),
          heading('Applied To:', HeadingLevel.HEADING_3),
          bullet('app/(patient)/journal/[id]/page.tsx — Next to crisis banners'),
          bullet('app/(therapist)/patients/[id]/page.tsx — Next to crisis alerts'),
          bullet('app/therapist/patients/[id]/page.tsx — Next to crisis alerts'),
          emptyLine(),

          heading('2.4 ExportButton', HeadingLevel.HEADING_2),
          para('File: components/shared/ExportButton.tsx (NEW)'),
          para('A button component that triggers PDF export of patient progression reports. Uses dynamic import of lib/pdf-export to lazy-load jsPDF only when needed. Shows a loading spinner during export.'),
          para('Props accepted: patientName, dateRange, clinicianName, moodTrend, phq9Trajectory, gad7Trajectory, symptomClusters, weeklySummaries, totalEntries, avgMood, avgAnxiety.'),
          emptyLine(),

          heading('3. Loading State Components', HeadingLevel.HEADING_1),

          heading('3.1 Skeleton', HeadingLevel.HEADING_2),
          para('File: components/ui/Skeleton.tsx (NEW)'),
          para('A versatile loading skeleton component with four variants:'),
          simpleTable(
            ['Variant', 'Shape', 'Default Size'],
            [
              ['line', 'Rounded rectangle', 'h-4 full width'],
              ['circle', 'Circle', 'w-10 h-10'],
              ['card', 'Rounded card', 'h-24 full width'],
              ['chart', 'Chart placeholder', 'h-48 full width'],
            ]
          ),
          para('Also exports DashboardSkeleton — a pre-composed layout skeleton for dashboard pages with multiple card and chart placeholders.'),
          emptyLine(),

          heading('3.2 ChartSkeleton', HeadingLevel.HEADING_2),
          para('File: components/charts/ChartSkeleton.tsx (NEW)'),
          para('A chart-specific loading skeleton with animated pulse effect using sage colors. Renders a bar chart placeholder with sine-wave height variation. Accepts a configurable height prop.'),
          emptyLine(),

          heading('4. Chart Component Updates', HeadingLevel.HEADING_1),
          para('All five chart components were updated with improvements to error handling, data display, and visual polish.'),
          simpleTable(
            ['Component', 'File', 'Changes'],
            [
              ['DailyMoodPattern', 'components/charts/DailyMoodPattern.tsx', 'Updated bar chart for time-of-day patterns; improved axis labels and color coding'],
              ['MoodTimeline', 'components/charts/MoodTimeline.tsx', 'Updated area chart with time range selector; smoother gradients'],
              ['SleepCorrelation', 'components/charts/SleepCorrelation.tsx', 'Updated scatter chart for sleep-mood correlation; improved tooltip formatting'],
              ['SymptomChart', 'components/charts/SymptomChart.tsx', 'Updated horizontal bar chart for symptom frequency; better label truncation'],
              ['WellnessChart', 'components/charts/WellnessChart.tsx', 'Updated area chart with summary stats; added ChartSkeleton loading state'],
            ]
          ),
          emptyLine(),

          heading('5. PDF Export', HeadingLevel.HEADING_1),
          para('File: lib/pdf-export.ts (NEW)'),
          para('A programmatic PDF report generator using jsPDF (no DOM screenshots). Generates patient progression reports including:'),
          bullet('Patient name, date range, and clinician name header'),
          bullet('Mood trend visualization (tabular representation)'),
          bullet('PHQ-9 and GAD-7 score trajectories'),
          bullet('Top symptom clusters with frequency counts'),
          bullet('Weekly narrative summaries'),
          bullet('Summary statistics (total entries, average mood, average anxiety)'),
          para('Triggered via the ExportButton component with lazy-loaded imports for optimal bundle size.'),
          emptyLine(),

          heading('6. Journal Editor Enhancements', HeadingLevel.HEADING_1),
          para('File: components/journal/JournalEditor.tsx (MODIFIED)'),
          para('The journal editor received several UX improvements:'),
          bullet('Character limit enforcement (5,000 characters, matching server-side validation)'),
          bullet('Live word count display'),
          bullet('Character count with color-coded warning (amber near limit, red at/over limit)'),
          bullet('Auto-resize textarea that grows with content'),
          bullet('Keyboard shortcut: Ctrl+S to save'),
          bullet('Minimum height configuration'),
          bullet('Auto-focus option'),
          bullet('Guided prompt integration support'),
          emptyLine(),

          heading('7. Page-Level Changes', HeadingLevel.HEADING_1),
          simpleTable(
            ['Page', 'Changes'],
            [
              ['app/(patient)/journal/[id]/page.tsx', 'Added AIOutputLabel on AI insights, CrisisKeywordDisclaimer on crisis banners, emotions/symptoms displayed as colored tags'],
              ['app/(patient)/journal/new/page.tsx', 'Multi-step guided flow (mood → prompt → write → structured → review), share-with-therapist toggle, double-submit prevention'],
              ['app/(therapist)/patients/[id]/page.tsx', 'ClinicalDecisionBanner at top, PHQ-9/GAD-7 estimates with interpretations, z-scores, RCI calculations'],
              ['app/therapist/patients/[id]/page.tsx', 'ClinicalDecisionBanner, CrisisKeywordDisclaimer, LongitudinalProfileView integration'],
              ['app/dashboard/insights/page.tsx', 'AIOutputLabel banner, mood timeline, time-of-day patterns, symptoms chart, sleep correlation chart, best/worst time insights'],
              ['app/dashboard/page.tsx', 'WellnessChart integration, CrisisBanner, weekly narrative, themes display'],
              ['app/demo/clinician/patients/[id]/page.tsx', 'ClinicalDecisionBanner, AIOutputLabel, tabs for charts/summaries/evidence/feedback, z-scores and volatility display'],
              ['app/(auth)/login/page.tsx', 'Session expired message display from query parameter, DisclaimerBanner'],
            ]
          ),
          emptyLine(),

          heading('8. Component Export Updates', HeadingLevel.HEADING_1),
          bullet('components/shared/index.ts — Added exports: AIOutputLabel, ClinicalDecisionBanner, CrisisKeywordDisclaimer, ExportButton'),
          bullet('components/ui/index.ts — Added exports: Skeleton, DashboardSkeleton'),
          bullet('components/charts/index.ts — Added export: ChartSkeleton'),
        ],
      },
    ],
  })
}

// ---------------------------------------------------------------------------
// Document 4: Synthetic Data and Demo System
// ---------------------------------------------------------------------------
function buildSyntheticDoc(): Document {
  return new Document({
    sections: [
      {
        children: [
          ...titlePage('Synthetic Data & Demo System', 'Change Documentation'),

          heading('1. Overview', HeadingLevel.HEADING_1),
          para(
            'This document details the synthetic data generation system and demo mode infrastructure changes made on February 26, 2026. The system supports 6 patient archetypes with deterministic trajectories, a demo cohort seed script, and demo route gating.'
          ),
          emptyLine(),

          heading('2. Patient Archetypes', HeadingLevel.HEADING_1),
          para('File: lib/synthetic/archetypes.ts (MODIFIED — significant additions)'),
          para('Six clinically-informed patient archetypes model different treatment trajectories. Each archetype defines a deterministic mood/anxiety curve over time, with configurable noise and theme selection.'),
          emptyLine(),
          simpleTable(
            ['Archetype', 'Mood Trajectory', 'Anxiety Trajectory', 'Clinical Pattern'],
            [
              ['gradual_improver', 'Starts low (3-4), steadily rises to 7-8', 'Starts high (7-8), steadily drops to 2-3', 'Typical successful treatment response'],
              ['volatile_stabilizer', 'Wide swings (2-9), gradually stabilizing', 'Mirrors mood volatility, stabilizes later', 'Emotional dysregulation improving with skills'],
              ['hidden_deteriorator', 'Appears stable (5-6), slowly drops to 2-3', 'Low initially (3-4), creeps up to 7-8', 'Patient masking worsening; hard to detect clinically'],
              ['flat_non_responder', 'Stays around 4-5 with minimal change', 'Stays around 5-6 with minimal change', 'Treatment-resistant or wrong modality'],
              ['early_dropout', 'Shows 2-3 entries then stops', 'Shows 2-3 entries then stops', 'Engagement failure; incomplete data'],
              ['relapse_then_recover', 'Improves to 7, drops to 3, recovers to 6-7', 'Inverse of mood with lag', 'Setback followed by resilience'],
            ]
          ),
          emptyLine(),

          heading('2.1 Technical Implementation', HeadingLevel.HEADING_2),
          bullet('Seeded pseudo-random number generator (PRNG) for reproducible results'),
          bullet('Gaussian noise injection with configurable standard deviation per archetype'),
          bullet('Mood and anxiety computed independently (anxiety is NOT simply inverse of mood)'),
          bullet('Theme/trigger selection based on mood and anxiety band combinations'),
          bullet('Score clamping to valid 1-10 range'),
          emptyLine(),

          heading('3. Cohort Generator', HeadingLevel.HEADING_1),
          para('File: lib/synthetic/cohort-generator.ts (MODIFIED — significant additions)'),
          para('Orchestrates the generation of synthetic patient cohorts across all archetypes.'),
          bullet('Generates specified number of patients per archetype'),
          bullet('Creates journal entries spanning configurable date ranges (default: 30 days)'),
          bullet('Inserts entries into journal_entries table with is_synthetic = true flag'),
          bullet('Creates matching ai_extractions records with synthetic mood, anxiety, emotions, symptoms'),
          bullet('Batch processing for performance (inserts in groups of 10)'),
          boldBullet('resetSyntheticData()', 'Deletes all records with is_synthetic = true for clean re-seeding'),
          emptyLine(),

          heading('4. Journal Generator', HeadingLevel.HEADING_1),
          para('File: lib/synthetic/journal-generator.ts (MODIFIED — 125+ lines added)'),
          para('Template-based synthetic journal text generator producing realistic 3-8 sentence entries.'),
          heading('4.1 Generation Logic', HeadingLevel.HEADING_2),
          bullet('Mood band selection: low (1-3), mid-low (4-5), mid-high (6-7), high (8-10)'),
          bullet('Anxiety band selection: low (1-3), moderate (4-6), high (7-10)'),
          bullet('Sentence templates chosen from mood-band pools with randomized selection'),
          bullet('Anxiety-specific sentences added independently based on anxiety band'),
          bullet('Theme/trigger injection based on mood-anxiety band combinations'),
          heading('4.2 Evidence Snippets', HeadingLevel.HEADING_2),
          para('The generator also produces evidence snippet mappings that link specific quotes from the generated text to the themes and triggers they represent. These evidence mappings enable the evaluation pipeline to validate AI extraction accuracy.'),
          emptyLine(),

          heading('5. Supabase Service Client', HeadingLevel.HEADING_1),
          para('File: lib/synthetic/supabase-service.ts (MODIFIED)'),
          para('Creates fresh Supabase service-role clients per function call to avoid stale authentication state issues during Next.js dev hot-reload. Uses SUPABASE_SERVICE_ROLE_KEY for admin-level database operations needed by the synthetic data pipeline.'),
          emptyLine(),

          heading('6. Demo Cohort Seed Script', HeadingLevel.HEADING_1),
          para('File: scripts/seed-demo-cohort.ts (NEW — 429 lines)'),
          para('A comprehensive seed script that creates a complete demo environment for showcasing the application.'),
          heading('6.1 Created Accounts', HeadingLevel.HEADING_2),
          simpleTable(
            ['Account Type', 'Name', 'Role', 'Details'],
            [
              ['Clinician', 'Dr. Sarah Chen', 'therapist', 'Primary clinician, 3 assigned patients'],
              ['Clinician', 'Dr. Marcus Rivera', 'therapist', 'Secondary clinician, 2 assigned patients'],
              ['Admin', 'Admin User', 'admin', 'System administrator'],
              ['Patient', 'Alex Thompson', 'patient', 'Steady improvement archetype, 14 days'],
              ['Patient', 'Jordan Lee', 'patient', 'High volatility archetype, 14 days'],
              ['Patient', 'Casey Morgan', 'patient', 'Plateau then improvement, 14 days'],
              ['Patient', 'Riley Kim', 'patient', 'Gradual decline, 12 days'],
              ['Patient', 'Sam Patel', 'patient', 'Stable/low severity, 10 days'],
            ]
          ),
          heading('6.2 Generated Data per Patient', HeadingLevel.HEADING_2),
          bullet('Journal entries with realistic text (1 entry per day for assigned period)'),
          bullet('AI extraction records (mood, anxiety, emotions, symptoms, themes)'),
          bullet('Structured logs (sleep hours, medication adherence, energy level)'),
          bullet('EWMA baselines computed from entry history'),
          bullet('Crisis alerts generated when applicable (based on archetype)'),
          heading('6.3 Usage', HeadingLevel.HEADING_2),
          codePara('npm run seed:cohort'),
          para('Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.'),
          emptyLine(),

          heading('7. Demo Route Gating', HeadingLevel.HEADING_1),
          para('All 7 demo API routes received demo mode guard updates:'),
          simpleTable(
            ['Route', 'Method', 'Purpose'],
            [
              ['/api/demo/synthetic/generate', 'POST', 'Generate synthetic cohort'],
              ['/api/demo/synthetic/patients', 'GET', 'List synthetic patients'],
              ['/api/demo/synthetic/patients/[id]', 'GET', 'Get synthetic patient detail'],
              ['/api/demo/synthetic/patients/[id]/metrics', 'GET', 'Get patient metrics'],
              ['/api/demo/synthetic/patients/[id]/summaries', 'GET', 'Get patient summaries'],
              ['/api/demo/synthetic/feedback', 'POST', 'Submit clinician feedback'],
              ['/api/demo/synthetic/reset', 'POST', 'Reset synthetic data'],
            ]
          ),
          para('Routes are gated at the middleware level: when NEXT_PUBLIC_DEMO_MODE is not "true", all /demo/* and /api/demo/* paths return 404.'),
          emptyLine(),

          heading('8. Demo Mode Helper', HeadingLevel.HEADING_1),
          para('File: lib/demo-mode.ts (MODIFIED)'),
          para('Provides server-side and client-side feature flag checks for demo mode:'),
          boldBullet('isDemoMode()', 'Server-side check of NEXT_PUBLIC_DEMO_MODE === "true"'),
          boldBullet('isDemoModeClient()', 'Client-side check using typeof window !== "undefined"'),
          boldBullet('demoModeGuard()', 'Returns NextResponse with 404 if demo mode is disabled (for API routes)'),
        ],
      },
    ],
  })
}

// ---------------------------------------------------------------------------
// Document 5: API and Backend Enhancements
// ---------------------------------------------------------------------------
function buildAPIDoc(): Document {
  return new Document({
    sections: [
      {
        children: [
          ...titlePage('API & Backend Enhancements', 'Change Documentation'),

          heading('1. Overview', HeadingLevel.HEADING_1),
          para(
            'This document details all API route modifications and backend enhancements made on February 26, 2026. Changes include security hardening of existing routes, new utility libraries, type system extensions, and prompt engineering improvements.'
          ),
          emptyLine(),

          heading('2. AI Extraction Route', HeadingLevel.HEADING_1),
          para('File: app/api/ai/extract/route.ts (MODIFIED — 67 lines changed)'),
          para('The AI symptom extraction endpoint received comprehensive hardening:'),
          heading('2.1 Changes Applied', HeadingLevel.HEADING_2),
          simpleTable(
            ['Feature', 'Implementation', 'Purpose'],
            [
              ['Rate limiting', 'aiExtractionLimiter.check() — 10 req/60s per IP', 'Prevent abuse of expensive OpenAI calls'],
              ['Input sanitization', 'sanitizeText() on content body', 'Strip HTML/scripts before processing'],
              ['Length validation', 'Max 5,000 characters', 'Prevent oversized payloads'],
              ['Access logging', 'logAccess({ action: "ran_ai_extraction" })', 'HIPAA audit trail'],
              ['Timeout/retry', 'withRetry(fn, { timeoutMs: 30000, maxRetries: 1 })', 'Prevent indefinite hanging'],
              ['Error handling', 'Returns 504 on ApiTimeoutError', 'User-friendly timeout message'],
            ]
          ),
          heading('2.2 Request Flow', HeadingLevel.HEADING_2),
          para('1. Client IP extracted via getClientIdentifier()'),
          para('2. Rate limit checked — returns 429 with Retry-After header if exceeded'),
          para('3. Content sanitized and length-validated — returns 400 if invalid'),
          para('4. OpenAI API called via withRetry() — wraps with 30s timeout + 1 retry'),
          para('5. Successful extraction logged to access_logs'),
          para('6. Returns extracted data (mood, anxiety, emotions, symptoms, themes)'),
          emptyLine(),

          heading('3. Guided Prompt Route', HeadingLevel.HEADING_1),
          para('File: app/api/ai/guided-prompt/route.ts (MODIFIED — 15 lines changed)'),
          simpleTable(
            ['Feature', 'Implementation'],
            [
              ['Rate limiting', 'aiGuidedPromptLimiter.check() — 15 req/60s per IP'],
              ['Access logging', 'logAccess({ action: "ran_guided_prompt" })'],
            ]
          ),
          para('No input sanitization needed as this route does not accept free-text content that gets stored.'),
          emptyLine(),

          heading('4. Journal Routes', HeadingLevel.HEADING_1),
          heading('4.1 POST /api/journal (Create)', HeadingLevel.HEADING_2),
          para('File: app/api/journal/route.ts (MODIFIED — 13 lines changed)'),
          bullet('Input validation via validateJournalContent() — checks required, non-empty, max length, sanitizes'),
          bullet('Sanitized content stored in database (not raw user input)'),
          bullet('Access logging: "created_journal_entry" on successful creation'),
          bullet('Access logging: "viewed_journal_list" on GET requests'),

          heading('4.2 GET/PATCH/DELETE /api/journal/[id]', HeadingLevel.HEADING_2),
          para('File: app/api/journal/[id]/route.ts (MODIFIED — 10 lines changed)'),
          bullet('GET: Access logging with "viewed_journal_entry" action'),
          bullet('PATCH: sanitizeText() applied to updated content before database write'),
          bullet('PATCH: Access logging with "updated_journal_entry" action'),
          bullet('DELETE: Access logging with "deleted_journal_entry" action'),
          emptyLine(),

          heading('5. Demo Synthetic Routes', HeadingLevel.HEADING_1),
          para('All 7 demo API routes (feedback, generate, patients, patients/[id], patients/[id]/metrics, patients/[id]/summaries, reset) received identical 2-line additions importing and checking the demo mode guard. These routes already had functionality but were previously accessible even when demo mode was disabled.'),
          emptyLine(),

          heading('6. New Utility Libraries', HeadingLevel.HEADING_1),

          heading('6.1 lib/api-helpers.ts (NEW)', HeadingLevel.HEADING_2),
          para('Shared utilities for external API calls:'),
          boldBullet('ApiTimeoutError', 'Custom error class for timeout identification in catch blocks'),
          boldBullet('withTimeout(promise, timeoutMs)', 'Race between the promise and a timeout timer; throws ApiTimeoutError on expiry'),
          boldBullet('withRetry(fn, { maxRetries, baseDelayMs, timeoutMs })', 'Retry with exponential backoff: delay = baseDelayMs * 2^attempt. Defaults: 1 retry, 2s base delay, 30s timeout'),

          heading('6.2 lib/rate-limit.ts (NEW)', HeadingLevel.HEADING_2),
          para('In-memory sliding-window rate limiter. See Security & HIPAA Compliance document for full details.'),

          heading('6.3 lib/sanitize.ts (NEW)', HeadingLevel.HEADING_2),
          para('Input sanitization and journal content validation. See Security & HIPAA Compliance document for full details.'),

          heading('6.4 lib/access-log.ts (NEW)', HeadingLevel.HEADING_2),
          para('Structured HIPAA access logging. See Security & HIPAA Compliance document for full details.'),

          heading('6.5 lib/pdf-export.ts (NEW)', HeadingLevel.HEADING_2),
          para('Programmatic PDF report generator using jsPDF. See UI/UX & Clinical Guardrails document for full details.'),
          emptyLine(),

          heading('7. Type System Changes', HeadingLevel.HEADING_1),
          para('File: types/index.ts (MODIFIED)'),
          para('New types added to support time-of-day analysis and enhanced AI extraction responses:'),
          simpleTable(
            ['Type', 'Purpose'],
            [
              ['TimeOfDay', 'Union type: "morning" | "afternoon" | "evening" | "night"'],
              ['MoodByTimeOfDay', 'Map of TimeOfDay to mood/anxiety arrays'],
              ['TimeOfDayMoodSummary', 'Aggregated mood/anxiety/count per time period'],
              ['HourlyMoodData', 'Per-hour mood data point for chart rendering'],
              ['AIExtractionResponseV2', 'Extended extraction response with evidence spans (character offsets)'],
            ]
          ),
          emptyLine(),

          heading('8. Prompt Engineering Changes', HeadingLevel.HEADING_1),
          para('File: prompts/symptom_extraction.txt (MODIFIED — 18 lines changed)'),
          para('The AI symptom extraction prompt was enhanced with:'),
          bullet('Detailed anxiety scoring scale (1-10) with specific band definitions: 1-2 minimal, 3-4 mild, 5-6 moderate, 7-8 high, 9-10 severe'),
          bullet('Indirect anxiety indicators list: sleep disruption, racing thoughts, avoidance behavior, physical tension, difficulty concentrating, irritability'),
          bullet('Evidence format rules requiring character offsets (start, end) linking extracted fields to source text'),
          bullet('Explicit instruction that anxiety and mood scores are independent dimensions (anxiety is NOT simply the inverse of mood)'),
          emptyLine(),

          heading('9. Middleware Changes', HeadingLevel.HEADING_1),
          para('File: middleware.ts (MODIFIED — 19 lines changed)'),
          para('See Security & HIPAA Compliance document for full details. Key changes:'),
          bullet('HTTPS enforcement via x-forwarded-proto header check'),
          bullet('Demo mode gating (404 for /demo/* when disabled)'),
          bullet('Session expiry redirect with reason=session_expired query parameter'),
          bullet('Role-based redirect for authenticated users on auth pages'),
          bullet('Static asset bypass for performance'),
        ],
      },
    ],
  })
}

// ---------------------------------------------------------------------------
// Document 6: DevOps and Configuration
// ---------------------------------------------------------------------------
function buildDevOpsDoc(): Document {
  return new Document({
    sections: [
      {
        children: [
          ...titlePage('DevOps & Configuration', 'Change Documentation'),

          heading('1. Overview', HeadingLevel.HEADING_1),
          para(
            'This document covers all DevOps, configuration, and infrastructure script changes made on February 26, 2026. Changes include package.json updates, .gitignore additions, Playwright configuration, Neo4j backfill script, and public data ingestion updates.'
          ),
          emptyLine(),

          heading('2. Package.json Changes', HeadingLevel.HEADING_1),
          para('File: package.json (MODIFIED — 11 lines changed)'),

          heading('2.1 New Scripts', HeadingLevel.HEADING_2),
          simpleTable(
            ['Script Name', 'Command', 'Purpose'],
            [
              ['seed:cohort', 'ts-node scripts/seed-demo-cohort.ts', 'Seeds the database with demo patient data (2 clinicians, 1 admin, 5 patients with journal entries and AI extractions)'],
              ['test:perf', 'ts-node scripts/perf-test.ts', 'Runs performance benchmarks against API routes, reports avg/p50/p95/p99 response times'],
              ['test:e2e', 'playwright test', 'Runs Playwright E2E tests in headless mode'],
              ['test:e2e:ui', 'playwright test --ui', 'Runs Playwright E2E tests with interactive UI for debugging'],
              ['test:integration', 'vitest run --config vitest.integration.config.ts', 'Runs integration tests against live Supabase instance'],
              ['eval:report', 'ts-node scripts/eval-report.ts', 'Generates an HTML accuracy evaluation report for AI extraction and calibration models'],
            ]
          ),

          heading('2.2 New Dependencies', HeadingLevel.HEADING_2),
          simpleTable(
            ['Package', 'Type', 'Purpose'],
            [
              ['@playwright/test', 'devDependency', 'End-to-end browser testing framework'],
              ['jspdf', 'dependency', 'Programmatic PDF generation for patient reports'],
              ['docx', 'devDependency', 'Word document generation for project documentation'],
            ]
          ),
          emptyLine(),

          heading('3. .gitignore Changes', HeadingLevel.HEADING_1),
          para('File: .gitignore (MODIFIED — 7 lines added)'),
          para('New entries added to prevent test artifacts and generated reports from being committed:'),
          simpleTable(
            ['Pattern', 'Purpose'],
            [
              ['/test-results/', 'Playwright test result artifacts'],
              ['/playwright-report/', 'Playwright HTML test reports'],
              ['/blob-report/', 'Playwright blob report storage'],
              ['/playwright/.cache/', 'Playwright browser cache'],
              ['/reports/', 'Generated evaluation reports (from eval:report script)'],
            ]
          ),
          emptyLine(),

          heading('4. Playwright Configuration', HeadingLevel.HEADING_1),
          para('File: playwright.config.ts (NEW — 26 lines)'),
          para('Configures the Playwright E2E testing framework:'),
          simpleTable(
            ['Setting', 'Value', 'Notes'],
            [
              ['testDir', './e2e', 'All E2E spec files live in the e2e/ directory'],
              ['fullyParallel', 'true', 'Tests run concurrently for speed'],
              ['forbidOnly', 'true (CI only)', 'Prevents .only from being left in committed tests'],
              ['retries', '2 (CI), 0 (local)', 'Retry flaky tests in CI'],
              ['workers', '1 (CI), auto (local)', 'Single worker in CI for stability'],
              ['reporter', 'html', 'Generates browsable HTML reports'],
              ['baseURL', 'http://localhost:3000', 'Target URL for test navigation'],
              ['trace', 'on-first-retry', 'Captures trace on retry for debugging'],
              ['screenshot', 'only-on-failure', 'Captures screenshots when tests fail'],
              ['browser', 'Chromium', 'Single browser project (expandable)'],
              ['webServer', 'npm run dev', 'Auto-starts dev server if not running'],
            ]
          ),
          emptyLine(),

          heading('5. Neo4j Backfill Script', HeadingLevel.HEADING_1),
          para('File: scripts/neo4j-backfill.ts (NEW — 440 lines)'),
          para(
            'A comprehensive script for syncing Supabase journal data to the Neo4j graph database. Recreates the full graph structure for analysis and predictions.'
          ),
          heading('5.1 Graph Nodes Created', HeadingLevel.HEADING_2),
          simpleTable(
            ['Node Type', 'Properties', 'Source'],
            [
              ['User', 'id, role, created_at', 'profiles table'],
              ['Entry', 'id, content, created_at, patient_id', 'journal_entries table'],
              ['SelfReport', 'mood, anxiety, sleep, energy', 'structured_logs table'],
              ['AffectPoint', 'mood, anxiety, emotions array', 'ai_extractions table'],
              ['Feature', 'name, category', 'Extracted symptoms and themes'],
            ]
          ),
          heading('5.2 Relationships', HeadingLevel.HEADING_2),
          bullet('User -[:WROTE]-> Entry'),
          bullet('Entry -[:HAS_REPORT]-> SelfReport'),
          bullet('Entry -[:HAS_AFFECT]-> AffectPoint'),
          bullet('Entry -[:MENTIONS]-> Feature'),
          bullet('Entry -[:NEXT]-> Entry (temporal chain per patient)'),
          heading('5.3 Usage', HeadingLevel.HEADING_2),
          codePara('npx ts-node scripts/neo4j-backfill.ts'),
          codePara('npx ts-node scripts/neo4j-backfill.ts --force  # Re-ingest all entries'),
          para('Processes in batches of 50 entries. Handles missing entries gracefully and reports counts.'),
          emptyLine(),

          heading('6. Public Data Ingestion Updates', HeadingLevel.HEADING_1),
          para('File: scripts/ingest-public-data.ts (MODIFIED — 8 lines changed)'),
          para(
            'Minor updates to the public dataset ingestion pipeline for compatibility with the updated extraction schema:'
          ),
          bullet('Updated extraction call to pass evidence format parameters'),
          bullet('Adjusted EWMA baseline computation to match new score ranges'),
          bullet('Added error handling for rate-limited OpenAI API calls'),
          emptyLine(),

          heading('7. Evaluation Report Script', HeadingLevel.HEADING_1),
          para('File: scripts/eval-report.ts (NEW — 1,239 lines)'),
          para('See Testing Infrastructure document for full details. Generates automated accuracy evaluation reports.'),
          emptyLine(),

          heading('8. Performance Test Script', HeadingLevel.HEADING_1),
          para('File: scripts/perf-test.ts (NEW — 197 lines)'),
          para('See Testing Infrastructure document for full details. Benchmarks API response times.'),
          emptyLine(),

          heading('9. Demo Cohort Seed Script', HeadingLevel.HEADING_1),
          para('File: scripts/seed-demo-cohort.ts (NEW — 429 lines)'),
          para('See Synthetic Data & Demo System document for full details. Creates demo environment.'),
          emptyLine(),

          heading('10. Documentation', HeadingLevel.HEADING_1),
          para('File: REPORT.md (NEW — 271 lines)'),
          para('A comprehensive Markdown report documenting:'),
          bullet('Test coverage summary (172 unit tests, 15 integration tests, 16 E2E scenarios)'),
          bullet('Security audit checklist with pass/fail status'),
          bullet('Clinical guardrails audit with component placement details'),
          bullet('Performance baseline infrastructure'),
          bullet('Demo readiness status (seed script, PDF export, account details)'),
          bullet('Known gaps and prioritized next steps'),
          emptyLine(),

          heading('11. Complete File Change Summary', HeadingLevel.HEADING_1),
          heading('New Files', HeadingLevel.HEADING_2),
          simpleTable(
            ['File', 'Lines', 'Category'],
            [
              ['lib/rate-limit.ts', '89', 'Security'],
              ['lib/sanitize.ts', '51', 'Security'],
              ['lib/access-log.ts', '42', 'Security'],
              ['lib/api-helpers.ts', '40', 'Security'],
              ['lib/pdf-export.ts', '~200', 'Feature'],
              ['lib/__tests__/clinical-scales.test.ts', '~300', 'Testing'],
              ['lib/__tests__/crisis-detection.test.ts', '~350', 'Testing'],
              ['lib/__tests__/dashboard-utils.test.ts', '~400', 'Testing'],
              ['lib/__tests__/wellness-utils.test.ts', '~250', 'Testing'],
              ['lib/__tests__/longitudinal-profile.test.ts', '~350', 'Testing'],
              ['lib/__tests__/integration/journal-api.test.ts', '~200', 'Testing'],
              ['lib/__tests__/integration/rls-policies.test.ts', '~150', 'Testing'],
              ['e2e/auth.spec.ts', '~100', 'Testing'],
              ['e2e/patient-checkin.spec.ts', '~60', 'Testing'],
              ['e2e/clinician-dashboard.spec.ts', '~60', 'Testing'],
              ['e2e/error-states.spec.ts', '~50', 'Testing'],
              ['playwright.config.ts', '26', 'Configuration'],
              ['components/shared/AIOutputLabel.tsx', '27', 'UI'],
              ['components/shared/ClinicalDecisionBanner.tsx', '17', 'UI'],
              ['components/shared/CrisisKeywordDisclaimer.tsx', '12', 'UI'],
              ['components/shared/ExportButton.tsx', '48', 'UI'],
              ['components/ui/Skeleton.tsx', '~80', 'UI'],
              ['components/charts/ChartSkeleton.tsx', '~40', 'UI'],
              ['scripts/seed-demo-cohort.ts', '429', 'DevOps'],
              ['scripts/eval-report.ts', '1,239', 'DevOps'],
              ['scripts/perf-test.ts', '197', 'DevOps'],
              ['scripts/neo4j-backfill.ts', '440', 'DevOps'],
              ['REPORT.md', '271', 'Documentation'],
            ]
          ),
          emptyLine(),
          heading('Modified Files (40+)', HeadingLevel.HEADING_2),
          para('Total: 841 lines added, 216 lines removed across 40 modified files.'),
          bullet('API routes: 6 files (extract, guided-prompt, journal, journal/[id], + 7 demo routes)'),
          bullet('Pages: 8 files (login, journal/[id], journal/new, therapist patients, dashboard, insights, demo clinician)'),
          bullet('Components: 7 files (5 charts + JournalEditor + barrel exports)'),
          bullet('Library: 5 files (demo-mode, longitudinal-profile, synthetic archetypes/cohort/journal/supabase)'),
          bullet('Configuration: 4 files (package.json, package-lock.json, .gitignore, types/index.ts)'),
          bullet('Prompts: 1 file (symptom_extraction.txt)'),
          bullet('Scripts: 1 file (ingest-public-data.ts)'),
        ],
      },
    ],
  })
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const outDir = path.join(process.cwd(), 'docs')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  const docs: [string, Document][] = [
    ['01-Security-and-HIPAA-Compliance.docx', buildSecurityDoc()],
    ['02-Testing-Infrastructure.docx', buildTestingDoc()],
    ['03-UI-UX-and-Clinical-Guardrails.docx', buildUIDoc()],
    ['04-Synthetic-Data-and-Demo-System.docx', buildSyntheticDoc()],
    ['05-API-and-Backend-Enhancements.docx', buildAPIDoc()],
    ['06-DevOps-and-Configuration.docx', buildDevOpsDoc()],
  ]

  for (const [filename, doc] of docs) {
    const buffer = await Packer.toBuffer(doc)
    const outPath = path.join(outDir, filename)
    fs.writeFileSync(outPath, buffer)
    console.log(`Generated: ${outPath}`)
  }

  console.log(`\nAll ${docs.length} documents generated in ${outDir}`)
}

main().catch(err => {
  console.error('Failed to generate docs:', err)
  process.exit(1)
})
