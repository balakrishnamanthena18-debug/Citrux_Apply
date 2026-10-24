import { test, expect, Page } from '@playwright/test';
import { loginUser } from './helpers/auth';
import type { ValidatedAuditReport, ValidatedJobFinding } from '@/lib/data-quality/dashboard-schema';
import { getStorageKey } from '@/components/admin/data-quality/review-state-store';

/**
 * Stage 6.2 / 6.4A — Playwright Browser E2E Verification
 * Isolated tests for the OOS Data Quality Review Workbench.
 *
 * Scenarios:
 * E2E-01 — Workbench loads
 * E2E-02 — Dynamic-filter pagination regression
 * E2E-03 — Evidence-gated review
 * E2E-04 — Local review persistence
 * E2E-05 — Backup import/export
 * E2E-06 — Reconciled export modal and offline downloads
 */

/**
 * Creates deterministic audit reports conforming to fullAuditReportSchema
 * without requiring real external job portal data or network calls.
 */
function createDeterministicAuditReport(datasetName: string, count: number): ValidatedAuditReport {
  const findings: ValidatedJobFinding[] = [];

  for (let i = 1; i <= count; i++) {
    const isDup = i % 2 === 0;
    const isForeign = i % 5 === 0;
    const pad = i.toString().padStart(3, '0');

    findings.push({
      recordId: `rec_test_${pad}`,
      publicSlug: `test-role-${pad}`,
      externalId: `ext_${pad}`,
      source: 'greenhouse',
      company: `Acme Health ${i % 3 === 0 ? 'Alpha' : 'Beta'}`,
      title: i === count ? 'Target Boundary Position' : `Staff Software Engineer ${pad}`,
      location: isForeign ? 'London, UK' : 'Austin, TX',
      rawUrl: `https://boards.greenhouse.io/acmehealth/jobs/${1000 + i}?gh_src=test`,
      canonicalUrl: `https://boards.greenhouse.io/acmehealth/jobs/${1000 + i}`,
      ats: {
        provider: 'greenhouse',
        requisitionId: `REQ-${1000 + i}`,
        trackingParametersRemoved: ['gh_src'],
        canonicalUrl: `https://boards.greenhouse.io/acmehealth/jobs/${1000 + i}`,
        isAtsUrl: true,
      },
      duplicate: {
        duplicateGroupId: isDup ? `grp_dup_${Math.floor(i / 2)}` : null,
        isDuplicateCandidate: isDup,
        confidence: isDup ? 'high' : 'distinct',
        reasonCode: isDup ? 'EXACT_ATS_CANONICAL_URL' : 'UNIQUE_RECORD',
        evidence: isDup ? 'Identical canonical ATS URL detected' : 'Unique vacancy record',
        candidateIdsInGroup: isDup ? [`rec_test_${pad}`] : [],
        candidateCountInGroup: isDup ? 2 : 1,
      },
      geography: {
        status: isForeign ? 'explicit_foreign' : 'valid_us',
        detectedCountry: isForeign ? 'United Kingdom' : 'United States',
        rawLocation: isForeign ? 'London, UK' : 'Austin, TX',
        rawCountryCodes: [isForeign ? 'gb' : 'us'],
        isDiscrepancy: isForeign,
        notes: isForeign ? 'Non-US municipality detected' : 'Valid US municipality',
      },
      freshness: {
        status: 'active_signal',
        closureSignals: [],
        suspectedIngestionBatch: false,
        postedAt: '2026-10-01T10:00:00Z',
        updatedAt: '2026-10-02T12:00:00Z',
        ageDays: 3,
        notes: 'Active vacancy listing',
      },
      aiReview: {
        used: false,
        status: 'needs_review',
        reason: 'Deterministic test audit fixture',
      },
    });
  }

  const dupCount = findings.filter((f) => f.duplicate.isDuplicateCandidate).length;
  const foreignCount = findings.filter((f) => f.geography.status === 'explicit_foreign').length;

  return {
    summary: {
      auditTimestamp: '2026-10-22T10:00:00.000Z',
      datasetName,
      totalRecordsAudited: count,
      aiMode: 'offline',
      duplicatePolicy: 'none',
      duplicates: {
        totalDuplicateCandidateRecords: dupCount,
        totalDuplicateCandidateGroups: Math.ceil(dupCount / 2),
        exactAtsUrlGroups: Math.ceil(dupCount / 2),
        distinctSameRoleGroups: 0,
      },
      geography: {
        validUs: count - foreignCount,
        explicitForeign: foreignCount,
        metadataDiscrepancy: 0,
        missingLocation: 0,
        ambiguous: 0,
      },
      freshness: {
        closureDetected: 0,
        suspectedIngestionBatchTimestamps: 0,
        unknownVacancyStatus: 0,
      },
      aiReview: {
        offlineInvocations: 0,
        networkCallsBlocked: 0,
        recordsNeedingHumanReview: count,
      },
    },
    findings,
  };
}

/**
 * Loads an in-memory audit report payload into the Workbench via DataQualityImportModal
 */
async function importReportIntoWorkbench(
  page: Page,
  reportPayload: ValidatedAuditReport,
  filename = 'test-audit-report.json'
) {
  const trigger = page
    .locator(
      'button:has-text("Import JSON Report"), button:has-text("Import Audit Report"), button:has-text("Change Report")'
    )
    .first();
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: /Import Data Quality Audit Report/i });
  await expect(dialog).toBeVisible({ timeout: 5000 });

  const fileInput = dialog.locator('input[type="file"][accept=".json"]');
  await fileInput.setInputFiles({
    name: filename,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(reportPayload, null, 2)),
  });

  await expect(dialog.getByText('Validated Phase 1 Audit Report')).toBeVisible({ timeout: 10000 });

  const loadBtn = dialog.getByRole('button', { name: /Load Report into Dashboard/i });
  await loadBtn.click();

  await expect(dialog).not.toBeVisible({ timeout: 5000 });
}

test.describe('OOS Data Quality Review Workbench — Browser E2E Suite', () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test('E2E-01 — Workbench loads with isolated test environment', async ({ page }) => {
    await loginUser(page, 'admin');
    await page.goto('/admin/data-quality');
    await page.waitForLoadState('domcontentloaded');

    // Isolate localStorage at test start
    await page.evaluate(() => window.localStorage.clear());

    // 1. Verify header badges and offline contracts
    await expect(
      page.getByRole('heading', { level: 1, name: /Data Quality Review Dashboard/i })
    ).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('OOS Data Quality & Intelligence')).toBeVisible();
    await expect(page.getByText('AI_MODE=offline')).toBeVisible();
    await expect(page.getByText('MASTER_POLICY=none')).toBeVisible();

    // 2. Verify empty state renders when no report is loaded
    await expect(
      page.getByRole('heading', { level: 2, name: /No Data Quality Report Loaded/i })
    ).toBeVisible();
    await expect(
      page.locator('button:has-text("Import JSON Report"), button:has-text("Import Audit Report")').first()
    ).toBeVisible();

    // 3. Confirm zero existing review keys in isolated localStorage
    const initialKeys = await page.evaluate(() => {
      return Object.keys(window.localStorage).filter((k) => k.startsWith('oos_dq_review_'));
    });
    expect(initialKeys).toHaveLength(0);

    // 4. Import isolated test report
    const datasetName = 'e2e-isolation-test-01';
    const testReport = createDeterministicAuditReport(datasetName, 5);
    await importReportIntoWorkbench(page, testReport, 'e2e-isolation-test-01.json');

    // 5. Verify findings table renders exactly 5 items in unreviewed status
    await expect(page.getByText(`Auditing dataset: ${datasetName} (5 records)`)).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(5);
    await expect(page.locator('tbody tr').getByText('Unreviewed')).toHaveCount(5);
  });

  test('E2E-02 — Dynamic-filter pagination regression and safe bounds', async ({ page }) => {
    await loginUser(page, 'admin');
    await page.goto('/admin/data-quality');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => window.localStorage.clear());

    // 1. Load 51 findings to produce 3 pages (25, 25, 1)
    const datasetName = 'e2e-pagination-regression-dataset';
    const report51 = createDeterministicAuditReport(datasetName, 51);
    await importReportIntoWorkbench(page, report51, 'e2e-pagination-regression.json');

    // 2. Set active dynamic filter to "unreviewed"
    const reviewFilter = page.locator('select').filter({ has: page.locator('option[value="unreviewed"]') });
    await reviewFilter.selectOption('unreviewed');

    // Verify initial pagination on Page 1 (1 / 3) under dynamic filter
    await expect(page.getByText(/Showing 1 to 25 of 51 filtered findings/i)).toBeVisible();
    await expect(page.locator('span.font-mono', { hasText: '1 / 3' })).toBeVisible();

    // 3. Navigate to Page 2
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText(/Showing 26 to 50 of 51 filtered findings/i)).toBeVisible();
    await expect(page.locator('span.font-mono', { hasText: '2 / 3' })).toBeVisible();

    // 4. Navigate to final page (Page 3 with 1 finding: rec_test_051)
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText(/Showing 51 to 51 of 51 filtered findings/i)).toBeVisible();
    await expect(page.locator('span.font-mono', { hasText: '3 / 3' })).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr')).toContainText('rec_test_051');
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();

    // 5. Open finding #051 detail drawer
    await page.locator('tbody tr').first().click();
    const drawer = page.getByRole('dialog', { name: /Target Boundary Position/i });
    await expect(drawer).toBeVisible();

    // 6. Change review status so active dynamic filter removes the finding from the set
    // Escalate finding #051 -> status becomes "needs_review", removing it from "unreviewed" set
    await drawer.getByRole('button', { name: /Escalate: Needs Evidence/i }).click();

    // Close detail drawer
    await drawer.getByRole('button', { name: /Close detail view/i }).click();
    await expect(drawer).not.toBeVisible();

    // 7. Verify pagination regression fix:
    // Filtered items is now 50. Safe page clamps to 2.
    // Total pages is 2. Safe page is 2. Rows displayed is 25 (not empty!).
    await expect(page.locator('span.font-mono', { hasText: '2 / 2' })).toBeVisible();
    await expect(page.getByText(/Showing 26 to 50 of 50 filtered findings/i)).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(25);
    await expect(page.getByText(/No audit findings match the current filter selection/i)).not.toBeVisible();

    // 8. Test filter change reducing result set to fewer pages
    // Switch to "P1: Geography Issues" tab (10 items total in our deterministic dataset)
    await page.getByRole('button', { name: /P1: Geography Issues/i }).click();
    await expect(page.locator('span.font-mono', { hasText: '1 / 1' })).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(10);
  });

  test('E2E-03 — Evidence-gated review with checklist verification', async ({ page }) => {
    await loginUser(page, 'admin');
    await page.goto('/admin/data-quality');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => window.localStorage.clear());

    // 1. Load deterministic report with duplicate candidate finding #002
    const datasetName = 'e2e-evidence-gating-dataset';
    const report = createDeterministicAuditReport(datasetName, 4);
    await importReportIntoWorkbench(page, report, 'e2e-evidence-gating.json');

    // 2. Open finding rec_test_002 (duplicate candidate)
    const row002 = page.locator('tbody tr', { hasText: 'rec_test_002' });
    await row002.click();

    const drawer = page.locator('div[role="dialog"]', { hasText: 'rec_test_002' });
    await expect(drawer).toBeVisible();

    // 3. Verify confirmed dispositions remain locked when evidence tier is insufficient
    const tierSelect = drawer.locator('select#evidence-tier-select');
    await expect(tierSelect).toHaveValue('EVIDENCE_INSUFFICIENT');

    await expect(
      drawer.getByText(/Non-conclusive evidence tier: Confirmed dispositions locked/i)
    ).toBeVisible();

    const confirmRedundantBtn = drawer.getByRole('button', { name: /Confirm Redundant Dup/i });
    const confirmDistinctBtn = drawer.getByRole('button', { name: /Confirm Distinct Headcount/i });

    await expect(confirmRedundantBtn).toBeDisabled();
    await expect(confirmDistinctBtn).toBeDisabled();

    // 4. Select observed evidence tier
    await tierSelect.selectOption('EVIDENCE_OBSERVED');
    await expect(
      drawer.getByText(/Non-conclusive evidence tier: Confirmed dispositions locked/i)
    ).not.toBeVisible();

    // 5. Checklist section appears with 0/2 completed
    await expect(drawer.getByText(/Verification Checklist \(Required for Confirmation\)/i)).toBeVisible();
    await expect(drawer.getByText(/0\/2 completed/i)).toBeVisible();

    // Confirmed buttons must STILL be disabled while checklist is incomplete
    await expect(confirmRedundantBtn).toBeDisabled();
    await expect(confirmDistinctBtn).toBeDisabled();

    // 6. Check first item: Inspect Primary Job URL
    const urlCheck = drawer.locator('label', { hasText: 'Inspect Primary Job URL' }).locator('input[type="checkbox"]');
    await urlCheck.check();
    await expect(drawer.getByText(/1\/2 completed/i)).toBeVisible();
    await expect(confirmRedundantBtn).toBeDisabled();

    // 7. Check second item: Compare Requisition IDs
    const reqCheck = drawer.locator('label', { hasText: 'Compare Requisition IDs' }).locator('input[type="checkbox"]');
    await reqCheck.check();
    await expect(drawer.getByText(/2\/2 completed/i)).toBeVisible();

    // 8. Now confirmed buttons MUST be enabled
    await expect(confirmRedundantBtn).toBeEnabled();
    await expect(confirmDistinctBtn).toBeEnabled();

    // Fill attribution notes
    await drawer.locator('textarea#review-notes').fill('Verified identical requisition and canonical posting.');
    await drawer.locator('input#verification-source').fill('Greenhouse portal check');
    await drawer.locator('input#reviewer-attribution').fill('auditor@citrux.com');

    // 9. Execute review action
    await confirmRedundantBtn.click();

    // Close drawer
    await drawer.getByRole('button', { name: /Close detail view/i }).click();
    await expect(drawer).not.toBeVisible();

    // 10. Verify finding #002 displays "Reviewed" in table
    await expect(row002.getByText('Reviewed')).toBeVisible();
  });

  test('E2E-04 — Local review persistence across page reload', async ({ page }) => {
    await loginUser(page, 'admin');
    await page.goto('/admin/data-quality');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => window.localStorage.clear());

    const datasetName = 'e2e-persistence-test-dataset';
    const report = createDeterministicAuditReport(datasetName, 4);

    // 1. Import report into workbench
    await importReportIntoWorkbench(page, report, 'e2e-persistence-test.json');

    // 2. Save an eligible review using the existing UI
    const row002 = page.locator('tbody tr', { hasText: 'rec_test_002' });
    await row002.click();

    const drawer = page.locator('div[role="dialog"]', { hasText: 'rec_test_002' });
    await expect(drawer).toBeVisible();

    // Select EVIDENCE_OBSERVED and complete required checklist
    await drawer.locator('select#evidence-tier-select').selectOption('EVIDENCE_OBSERVED');
    await drawer.locator('label', { hasText: 'Inspect Primary Job URL' }).locator('input[type="checkbox"]').check();
    await drawer.locator('label', { hasText: 'Compare Requisition IDs' }).locator('input[type="checkbox"]').check();
    await drawer.locator('textarea#review-notes').fill('Persisted review notes for verification');
    await drawer.locator('input#verification-source').fill('ATS source portal');
    await drawer.locator('input#reviewer-attribution').fill('auditor@citrux.com');

    // Apply confirmed disposition
    await drawer.getByRole('button', { name: /Confirm Redundant Dup/i }).click();
    await drawer.getByRole('button', { name: /Close detail view/i }).click();
    await expect(drawer).not.toBeVisible();

    // Verify row displays Reviewed badge
    await expect(row002.getByText('Reviewed')).toBeVisible();

    // 3. Verify local review state exists in localStorage
    const storageKey = getStorageKey(datasetName);
    const storedState = await page.evaluate((key) => {
      return window.localStorage.getItem(key);
    }, storageKey);
    expect(storedState).toBeTruthy();
    const parsedState = JSON.parse(storedState!);
    expect(parsedState['rec_test_002']).toMatchObject({
      status: 'reviewed',
      disposition: 'DUPLICATE_CONFIRMED_REDUNDANT',
      evidenceTier: 'EVIDENCE_OBSERVED',
    });

    // 4. Reload page to test browser persistence in isolated test environment
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Re-load dataset report into dashboard memory
    await importReportIntoWorkbench(page, report, 'e2e-persistence-test.json');

    // 5. Confirm persisted review state survives reload
    await expect(row002.getByText('Reviewed')).toBeVisible();

    // 6. Open detail drawer to verify persisted decision fields
    await row002.click();
    const reopenedDrawer = page.locator('div[role="dialog"]', { hasText: 'rec_test_002' });
    await expect(reopenedDrawer).toBeVisible();

    await expect(reopenedDrawer.locator('select#evidence-tier-select')).toHaveValue('EVIDENCE_OBSERVED');
    await expect(reopenedDrawer.locator('textarea#review-notes')).toHaveValue('Persisted review notes for verification');

    // Verify review history reflects persisted record
    await reopenedDrawer.getByRole('button', { name: /Review Audit History/i }).click();
    await expect(reopenedDrawer.getByText('DUPLICATE_CONFIRMED_REDUNDANT').first()).toBeVisible();
    await expect(reopenedDrawer.getByText('auditor@citrux.com').first()).toBeVisible();

    await reopenedDrawer.getByRole('button', { name: /Close detail view/i }).click();
  });

  test('E2E-05 — Backup export, schema validation, and cross-dataset protection', async ({ page }) => {
    await loginUser(page, 'admin');
    await page.goto('/admin/data-quality');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => window.localStorage.clear());

    const datasetName = 'e2e-backup-test-dataset';
    const report = createDeterministicAuditReport(datasetName, 4);

    await importReportIntoWorkbench(page, report, 'e2e-backup-test.json');

    // 1. Create a review decision via existing UI
    const row002 = page.locator('tbody tr', { hasText: 'rec_test_002' });
    await row002.click();
    const drawer = page.locator('div[role="dialog"]', { hasText: 'rec_test_002' });
    await expect(drawer).toBeVisible();

    await drawer.locator('select#evidence-tier-select').selectOption('EVIDENCE_OBSERVED');
    await drawer.locator('label', { hasText: 'Inspect Primary Job URL' }).locator('input[type="checkbox"]').check();
    await drawer.locator('label', { hasText: 'Compare Requisition IDs' }).locator('input[type="checkbox"]').check();
    await drawer.locator('textarea#review-notes').fill('Backup test review note');
    await drawer.getByRole('button', { name: /Confirm Redundant Dup/i }).click();
    await drawer.getByRole('button', { name: /Close detail view/i }).click();
    await expect(drawer).not.toBeVisible();

    // 2. Open Review Backup modal
    await page.getByRole('button', { name: /Review Backup/i }).click();
    const backupDialog = page.getByRole('dialog', { name: /Review State Backup & Restore/i });
    await expect(backupDialog).toBeVisible();

    // Verify recorded decision count is 1
    await expect(backupDialog.getByText('1 records')).toBeVisible();

    // 3. Test Export Backup (JSON)
    const downloadPromise = page.waitForEvent('download');
    await backupDialog.getByRole('button', { name: /Export Backup \(JSON\)/i }).click();
    const download = await downloadPromise;

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    const exportedJson = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

    expect(exportedJson.version).toBe('2.0');
    expect(exportedJson.datasetName).toBe(datasetName);
    expect(exportedJson.reviews['rec_test_002']).toBeDefined();
    expect(exportedJson.reviews['rec_test_002'].disposition).toBe('DUPLICATE_CONFIRMED_REDUNDANT');

    // 4. Test Schema Validation on Malformed Restore
    const malformedBackup = { invalidProperty: true, count: 123 };
    const backupFileInput = backupDialog.locator('input[type="file"][accept=".json"]');
    await backupFileInput.setInputFiles({
      name: 'malformed-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(malformedBackup)),
    });

    await expect(backupDialog.getByText(/Invalid backup schema/i)).toBeVisible();

    // 5. Test Cross-Dataset Restore Protection (SEC-04)
    const foreignDatasetBackup = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      datasetName: 'other-foreign-dataset-2026',
      trustModelNotice: 'Point-in-Time Snapshot; Unsigned Browser-Local Attribution; Not Tamper-Proof Audit Record',
      reviews: {
        rec_test_004: {
          recordId: 'rec_test_004',
          fingerprint: 'fp_v2_cross_dataset_004',
          datasetName: 'other-foreign-dataset-2026',
          status: 'reviewed',
          disposition: 'DUPLICATE_CONFIRMED_REDUNDANT',
          evidenceTier: 'EVIDENCE_OBSERVED',
          checklist: { urlInspected: true, requisitionCompared: true },
          notes: 'Cross-dataset restored item',
          reviewedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          history: [],
        },
      },
    };

    await backupFileInput.setInputFiles({
      name: 'foreign-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(foreignDatasetBackup)),
    });

    // Verify warning dialog requires explicit cross-dataset confirmation
    await expect(backupDialog.getByRole('alert')).toBeVisible();
    await expect(backupDialog.getByText(/Cross-Dataset Restore Confirmation Required/i)).toBeVisible();
    await expect(backupDialog.getByText(/other-foreign-dataset-2026/i)).toBeVisible();
    await expect(backupDialog.getByRole('button', { name: /Confirm Cross-Dataset Restore/i })).toBeVisible();

    // Cancel the cross-dataset restore
    await backupDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(backupDialog.getByText(/Cross-Dataset Restore Confirmation Required/i)).not.toBeVisible();

    // Close backup modal (exact name to avoid matching Close modal icon button)
    await backupDialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(backupDialog).not.toBeVisible();
  });

  test('E2E-06 — Reconciled Export Modal and Offline Downloads', async ({ page }) => {
    await loginUser(page, 'admin');
    await page.goto('/admin/data-quality');
    await page.waitForLoadState('domcontentloaded');
    await page.evaluate(() => window.localStorage.clear());

    const datasetName = 'e2e-export-test-dataset';
    const report = createDeterministicAuditReport(datasetName, 4);

    // 1. Seed an orphaned review in localStorage prior to loading the report
    // to verify that orphaned reviews are segregated and accurately displayed in the modal
    const storageKey = getStorageKey(datasetName);
    const initialReviews = {
      orphan_rec_999: {
        recordId: 'orphan_rec_999',
        fingerprint: 'fp_v2_orphan_999',
        status: 'reviewed',
        disposition: 'DUPLICATE_CONFIRMED_REDUNDANT',
        evidenceTier: 'EVIDENCE_OBSERVED',
        checklist: { urlInspected: true, requisitionCompared: true },
        notes: 'Pre-existing orphaned review from older report cycle',
        reviewedAt: '2026-10-20T00:00:00Z',
        updatedAt: '2026-10-20T00:00:00Z',
      },
    };
    await page.evaluate(
      ({ key, data }) => {
        window.localStorage.setItem(key, JSON.stringify(data));
      },
      { key: storageKey, data: initialReviews }
    );

    // 2. Import the deterministic report into the workbench
    await importReportIntoWorkbench(page, report, 'e2e-export-test.json');

    // 3. Mark finding rec_test_002 as evidence-verified via the existing UI
    const row002 = page.locator('tbody tr', { hasText: 'rec_test_002' });
    await row002.click();
    const drawer = page.locator('div[role="dialog"]', { hasText: 'rec_test_002' });
    await expect(drawer).toBeVisible();

    await drawer.locator('select#evidence-tier-select').selectOption('EVIDENCE_OBSERVED');
    await drawer.locator('label', { hasText: 'Inspect Primary Job URL' }).locator('input[type="checkbox"]').check();
    await drawer.locator('label', { hasText: 'Compare Requisition IDs' }).locator('input[type="checkbox"]').check();
    await drawer.locator('textarea#review-notes').fill('Verified identical requisition for export');
    await drawer.locator('input#verification-source').fill('Greenhouse ATS Check');
    await drawer.locator('input#reviewer-attribution').fill('auditor@citrux.com');
    await drawer.getByRole('button', { name: /Confirm Redundant Dup/i }).click();
    await drawer.getByRole('button', { name: /Close detail view/i }).click();
    await expect(drawer).not.toBeVisible();
    await expect(row002.getByText('Reviewed')).toBeVisible();

    // 4. Open the Reconciled Export Modal
    const exportBtn = page.getByRole('button', { name: /Export Reconciled Report/i });
    await expect(exportBtn).toBeVisible();
    await exportBtn.click();

    const exportDialog = page.getByRole('dialog', { name: /Export Reconciled Audit Report/i });
    await expect(exportDialog).toBeVisible();

    // 5. Verify active dataset name display
    await expect(exportDialog.locator('[data-testid="active-dataset-name"]')).toHaveText(datasetName);
    await expect(exportDialog.getByText('Exact Match Enforced')).toBeVisible();

    // 6. Verify summary metrics match the fixture
    // Total findings in report: 4
    await expect(exportDialog.locator('[data-testid="summary-total-findings"]')).toHaveText('4');
    // Evidence verified: 1 (rec_test_002)
    await expect(exportDialog.locator('[data-testid="summary-verified"]')).toHaveText('1');
    // Unreviewed: 3 (rec_test_001, rec_test_003, rec_test_004)
    await expect(exportDialog.locator('[data-testid="summary-unreviewed"]')).toHaveText('3');
    // Escalated: 0
    await expect(exportDialog.locator('[data-testid="summary-escalated"]')).toHaveText('0');
    // Stale: 0
    await expect(exportDialog.locator('[data-testid="summary-stale"]')).toHaveText('0');
    // Legacy: 0
    await expect(exportDialog.locator('[data-testid="summary-legacy"]')).toHaveText('0');
    // Quarantined: 0
    await expect(exportDialog.locator('[data-testid="summary-quarantined"]')).toHaveText('0');
    // Orphaned: 1 (orphan_rec_999 preserved separately from audited findings denominator)
    await expect(exportDialog.locator('[data-testid="summary-orphans"]')).toHaveText('1');

    // 7. Verify trust notice box
    const trustNotice = exportDialog.locator('[data-testid="trust-notice-box"]');
    await expect(trustNotice).toBeVisible();
    await expect(trustNotice).toContainText(
      'Unsigned local working-state snapshot. This export reconciles algorithmic findings with browser-local review state. It is not a tamper-proof audit log or authoritative production record.'
    );

    // 8. Verify orphan guidance card and dedicated orphan download button
    await expect(exportDialog.getByText('1 Orphaned Review Record Preserved')).toBeVisible();
    const downloadOrphansBtn = exportDialog.getByRole('button', {
      name: /Download Orphaned Reviews CSV/i,
    });
    await expect(downloadOrphansBtn).toBeVisible();

    // 9. Test JSON Export Download & Schema Validation
    const jsonDownloadPromise = page.waitForEvent('download');
    await exportDialog.getByRole('button', { name: /Download Reconciled JSON Report/i }).click();
    const jsonDownload = await jsonDownloadPromise;

    // Verify safe filename convention
    const jsonFilename = jsonDownload.suggestedFilename();
    expect(jsonFilename).toMatch(/^reconciled-audit-e2e-export-test-dataset-.*\.json$/);

    // Read and parse downloaded JSON artifact
    const jsonStream = await jsonDownload.createReadStream();
    const jsonChunks: Buffer[] = [];
    for await (const chunk of jsonStream) {
      jsonChunks.push(chunk as Buffer);
    }
    const exportedJson = JSON.parse(Buffer.concat(jsonChunks).toString('utf-8'));

    // Verify JSON payload structure & schema version
    expect(exportedJson.schemaVersion).toBe('1.0');
    expect(exportedJson.datasetName).toBe(datasetName);
    expect(exportedJson.summary.totalFindingsInReport).toBe(4);
    expect(exportedJson.summary.reconciliationBreakdown.evidenceVerified).toBe(1);
    expect(exportedJson.summary.reconciliationBreakdown.unreviewed).toBe(3);
    expect(exportedJson.summary.reconciliationBreakdown.orphanedReviews).toBe(1);
    expect(exportedJson.reconciledFindings).toHaveLength(4);
    expect(exportedJson.orphanedReviews).toHaveLength(1);
    expect(exportedJson.orphanedReviews[0].recordId).toBe('orphan_rec_999');

    // Verify success banner appears
    await expect(exportDialog.locator('[data-testid="export-success-alert"]')).toContainText(jsonFilename);

    // 10. Test CSV Export Download & Content Validation
    const csvDownloadPromise = page.waitForEvent('download');
    await exportDialog.getByRole('button', { name: /Download Reconciled CSV/i }).click();
    const csvDownload = await csvDownloadPromise;

    // Verify safe CSV filename convention
    const csvFilename = csvDownload.suggestedFilename();
    expect(csvFilename).toMatch(/^reconciled-audit-e2e-export-test-dataset-.*\.csv$/);

    // Read and verify CSV stream content
    const csvStream = await csvDownload.createReadStream();
    const csvChunks: Buffer[] = [];
    for await (const chunk of csvStream) {
      csvChunks.push(chunk as Buffer);
    }
    const csvText = Buffer.concat(csvChunks).toString('utf-8');

    // Verify UTF-8 BOM encoding and required columns
    expect(csvText.charCodeAt(0)).toBe(0xfeff);
    expect(csvText).toContain('record_id,public_slug,external_id,source,company,role_title');
    expect(csvText).toContain('rec_test_002');
    expect(csvText).toContain('evidence_verified');
    expect(csvText).toContain('rec_test_001');
    expect(csvText).toContain('unreviewed');

    // 11. Test Dedicated Orphan CSV Download
    const orphanDownloadPromise = page.waitForEvent('download');
    await downloadOrphansBtn.click();
    const orphanDownload = await orphanDownloadPromise;

    const orphanFilename = orphanDownload.suggestedFilename();
    expect(orphanFilename).toMatch(/^orphaned-reviews-e2e-export-test-dataset-.*\.csv$/);

    const orphanStream = await orphanDownload.createReadStream();
    const orphanChunks: Buffer[] = [];
    for await (const chunk of orphanStream) {
      orphanChunks.push(chunk as Buffer);
    }
    const orphanText = Buffer.concat(orphanChunks).toString('utf-8');

    expect(orphanText.charCodeAt(0)).toBe(0xfeff);
    expect(orphanText).toContain('orphan_rec_999');
    expect(orphanText).toContain('orphaned_review');

    // 12. Close Export Modal via Close button
    await exportDialog.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(exportDialog).not.toBeVisible();
  });
});
