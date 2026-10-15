-- =============================================================================
-- Production Database Incident Repair Script
-- Incident: Supabase GoTrue Auth Scan Error on Column confirmation_token (NULL to string)
-- Target Table: auth.users
-- Target Scope: Exactly the 7 reviewed user accounts created via direct SQL without token columns
-- Status: AWAITING EXPLICIT HUMAN APPROVAL. DO NOT EXECUTE AUTOMATICALLY.
-- =============================================================================

-- =============================================================================
-- STEP 1: PRECONDITION AUDIT (Read-Only Inspection)
-- Confirm that the exact 7 reviewed accounts exist and have NULL token fields,
-- and that NO other accounts in auth.users have NULL tokens.
-- If any count does not match the expected value, DO NOT PROCEED.
-- =============================================================================
SELECT 
    COUNT(*) AS total_null_token_users_globally,
    COUNT(*) FILTER (WHERE id IN (
        '8804c640-ca28-44a5-be55-ec53c9ab9051',
        '33d4a773-e32e-44a0-ba59-11796b3974eb',
        '5bfb100a-39dd-42c8-b74e-d0e831bf4c64',
        'e93b589f-e23e-4d6b-b808-6935f09850c9',
        '058a57c3-0c31-41dd-aaf1-703da30ae3b0',
        '66959197-6955-4b99-b452-75012509cfcf',
        'a4c2346a-6afd-4274-918f-978dfff326f9'
    )) AS target_null_users_count,
    COUNT(*) FILTER (WHERE id NOT IN (
        '8804c640-ca28-44a5-be55-ec53c9ab9051',
        '33d4a773-e32e-44a0-ba59-11796b3974eb',
        '5bfb100a-39dd-42c8-b74e-d0e831bf4c64',
        'e93b589f-e23e-4d6b-b808-6935f09850c9',
        '058a57c3-0c31-41dd-aaf1-703da30ae3b0',
        '66959197-6955-4b99-b452-75012509cfcf',
        'a4c2346a-6afd-4274-918f-978dfff326f9'
    )) AS unintended_other_null_users_count
FROM auth.users
WHERE confirmation_token IS NULL 
   OR recovery_token IS NULL 
   OR email_change_token_new IS NULL 
   OR email_change IS NULL;
-- EXPECTED:
-- total_null_token_users_globally: 7
-- target_null_users_count: 7
-- unintended_other_null_users_count: 0

-- =============================================================================
-- STEP 2: PREVIEW THE EXACT 7 TARGET ROWS (Read-Only Inspection)
-- Confirm all 4 token fields are NULL for each of the 7 accounts:
-- =============================================================================
SELECT 
    id, 
    email, 
    created_at,
    confirmation_token IS NULL AS conf_is_null,
    recovery_token IS NULL AS rec_is_null,
    email_change_token_new IS NULL AS ectn_is_null,
    email_change IS NULL AS ec_is_null
FROM auth.users
WHERE id IN (
    '8804c640-ca28-44a5-be55-ec53c9ab9051',
    '33d4a773-e32e-44a0-ba59-11796b3974eb',
    '5bfb100a-39dd-42c8-b74e-d0e831bf4c64',
    'e93b589f-e23e-4d6b-b808-6935f09850c9',
    '058a57c3-0c31-41dd-aaf1-703da30ae3b0',
    '66959197-6955-4b99-b452-75012509cfcf',
    'a4c2346a-6afd-4274-918f-978dfff326f9'
)
ORDER BY created_at ASC;

-- =============================================================================
-- STEP 3: TRANSACTIONAL REPAIR WITH SELF-ASSERTING GUARDS
--
-- TARGET BOUNDARY:
-- Strictly the 7 verified user IDs and the 4 confirmed NULL token columns.
--
-- DEFENSIVE CONTROLS:
-- 1. Precondition assertion verifies:
--    - Exactly 7 reviewed user accounts have all 4 token columns NULL.
--    - Zero other accounts in auth.users have NULL token columns.
-- 2. Update modifies ONLY the 7 specified user IDs.
-- 3. Rowcount assertion verifies exactly 7 rows are updated.
-- 4. Postcondition assertion verifies:
--    - All 7 target accounts have empty strings ('') in all 4 token columns.
--    - Zero accounts outside target scope have NULL tokens.
--    - Zero NULL token accounts remain globally in auth.users.
-- Any assertion failure raises an exception and aborts the transaction immediately.
-- =============================================================================
BEGIN;

DO $$
DECLARE
    v_target_matching INTEGER;
    v_global_null_count INTEGER;
    v_unintended_pre INTEGER;
    v_updated INTEGER;
    v_target_verified INTEGER;
    v_unintended_post INTEGER;
    v_global_remaining INTEGER;
BEGIN
    -- 1. PRECONDITION ASSERTIONS
    -- Verify exact 7 target IDs match all 4 NULL conditions
    SELECT COUNT(*) INTO v_target_matching
    FROM auth.users
    WHERE id IN (
        '8804c640-ca28-44a5-be55-ec53c9ab9051',
        '33d4a773-e32e-44a0-ba59-11796b3974eb',
        '5bfb100a-39dd-42c8-b74e-d0e831bf4c64',
        'e93b589f-e23e-4d6b-b808-6935f09850c9',
        '058a57c3-0c31-41dd-aaf1-703da30ae3b0',
        '66959197-6955-4b99-b452-75012509cfcf',
        'a4c2346a-6afd-4274-918f-978dfff326f9'
    )
    AND confirmation_token IS NULL 
    AND recovery_token IS NULL 
    AND email_change_token_new IS NULL 
    AND email_change IS NULL;

    IF v_target_matching != 7 THEN
        RAISE EXCEPTION 'PRECONDITION FAILED: Expected exactly 7 target accounts with all 4 NULL fields, found %. Aborting.', v_target_matching;
    END IF;

    -- Verify no other unexpected accounts in auth.users have NULL tokens
    SELECT COUNT(*) INTO v_global_null_count
    FROM auth.users
    WHERE confirmation_token IS NULL 
       OR recovery_token IS NULL 
       OR email_change_token_new IS NULL 
       OR email_change IS NULL;

    IF v_global_null_count != 7 THEN
        RAISE EXCEPTION 'PRECONDITION FAILED: Global NULL token count is % (expected 7). Unreviewed affected records exist! Aborting.', v_global_null_count;
    END IF;

    -- 2. SCOPED UPDATE
    UPDATE auth.users
    SET 
        confirmation_token = COALESCE(confirmation_token, ''),
        recovery_token = COALESCE(recovery_token, ''),
        email_change_token_new = COALESCE(email_change_token_new, ''),
        email_change = COALESCE(email_change, ''),
        updated_at = NOW()
    WHERE id IN (
        '8804c640-ca28-44a5-be55-ec53c9ab9051',
        '33d4a773-e32e-44a0-ba59-11796b3974eb',
        '5bfb100a-39dd-42c8-b74e-d0e831bf4c64',
        'e93b589f-e23e-4d6b-b808-6935f09850c9',
        '058a57c3-0c31-41dd-aaf1-703da30ae3b0',
        '66959197-6955-4b99-b452-75012509cfcf',
        'a4c2346a-6afd-4274-918f-978dfff326f9'
    );

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated != 7 THEN
        RAISE EXCEPTION 'ROWCOUNT MISMATCH: Expected 7 rows updated, but % were modified. Aborting.', v_updated;
    END IF;

    -- 3. POSTCONDITION ASSERTIONS
    -- Verify all 7 target accounts have empty strings in all 4 columns
    SELECT COUNT(*) INTO v_target_verified
    FROM auth.users
    WHERE id IN (
        '8804c640-ca28-44a5-be55-ec53c9ab9051',
        '33d4a773-e32e-44a0-ba59-11796b3974eb',
        '5bfb100a-39dd-42c8-b74e-d0e831bf4c64',
        'e93b589f-e23e-4d6b-b808-6935f09850c9',
        '058a57c3-0c31-41dd-aaf1-703da30ae3b0',
        '66959197-6955-4b99-b452-75012509cfcf',
        'a4c2346a-6afd-4274-918f-978dfff326f9'
    )
    AND confirmation_token = ''
    AND recovery_token = ''
    AND email_change_token_new = ''
    AND email_change = '';

    IF v_target_verified != 7 THEN
        RAISE EXCEPTION 'POSTCONDITION FAILED: Expected 7 verified target accounts with empty strings, found %. Aborting.', v_target_verified;
    END IF;

    -- Verify zero unintended other records have NULL tokens
    SELECT COUNT(*) INTO v_unintended_post
    FROM auth.users
    WHERE id NOT IN (
        '8804c640-ca28-44a5-be55-ec53c9ab9051',
        '33d4a773-e32e-44a0-ba59-11796b3974eb',
        '5bfb100a-39dd-42c8-b74e-d0e831bf4c64',
        'e93b589f-e23e-4d6b-b808-6935f09850c9',
        '058a57c3-0c31-41dd-aaf1-703da30ae3b0',
        '66959197-6955-4b99-b452-75012509cfcf',
        'a4c2346a-6afd-4274-918f-978dfff326f9'
    )
    AND (confirmation_token IS NULL OR recovery_token IS NULL OR email_change_token_new IS NULL OR email_change IS NULL);

    IF v_unintended_post != 0 THEN
        RAISE EXCEPTION 'POSTCONDITION FAILED: % unintended records have NULL tokens. Aborting.', v_unintended_post;
    END IF;

    -- Verify zero NULL token records remain globally
    SELECT COUNT(*) INTO v_global_remaining
    FROM auth.users
    WHERE confirmation_token IS NULL 
       OR recovery_token IS NULL 
       OR email_change_token_new IS NULL 
       OR email_change IS NULL;

    IF v_global_remaining != 0 THEN
        RAISE EXCEPTION 'POSTCONDITION FAILED: % NULL token rows remain globally. Aborting.', v_global_remaining;
    END IF;

    RAISE NOTICE 'ALL ASSERTIONS PASSED: Exactly 7 verified accounts updated to empty strings. Zero NULL tokens remain.';
END $$;

-- Verify target account rows within transaction before final COMMIT
SELECT 
    id, 
    email, 
    confirmation_token, 
    recovery_token, 
    email_change_token_new, 
    email_change,
    updated_at
FROM auth.users
WHERE id IN (
    '8804c640-ca28-44a5-be55-ec53c9ab9051',
    '33d4a773-e32e-44a0-ba59-11796b3974eb',
    '5bfb100a-39dd-42c8-b74e-d0e831bf4c64',
    'e93b589f-e23e-4d6b-b808-6935f09850c9',
    '058a57c3-0c31-41dd-aaf1-703da30ae3b0',
    '66959197-6955-4b99-b452-75012509cfcf',
    'a4c2346a-6afd-4274-918f-978dfff326f9'
);

-- COMMIT TRANSACTION ONLY IF ALL PRECONDITIONS, ASSERTIONS, AND MANUAL CHECKS SUCCEEDED
COMMIT;

-- =============================================================================
-- STEP 4: ROLLBACK AND RECOVERY SPECIFICATION
--
-- A. ROLLBACK BEFORE COMMIT (In-Flight Transaction):
-- If running interactively and any condition fails or unexpected output appears
-- prior to running COMMIT, execute:
--     ROLLBACK;
-- This immediately discards all pending changes. The PL/pgSQL block automatically
-- raises an exception on any assertion failure, forcing an immediate ROLLBACK.
--
-- B. RECOVERY AFTER COMMIT (Post-Commit Restoration):
-- Once COMMIT is executed, the transaction is durable and cannot be rolled back
-- using a SQL ROLLBACK command.
--
-- Supported Recovery Procedure:
-- 1. Restore from the pre-repair Supabase project backup or PITR snapshot.
-- 2. Do NOT restore token values to NULL as a normal recovery strategy: NULL token
--    values are the direct cause of the GoTrue scan error and re-corrupt the system.
-- =============================================================================
