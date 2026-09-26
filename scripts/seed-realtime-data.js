import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";
const { Pool } = pg;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
const operatingOrgId = process.env.OPERATING_ORGANIZATION_ID || "00000000-0000-0000-0000-000000000001";

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const pool = new Pool({ connectionString });

async function main() {
  console.log("==========================================");
  console.log("SEEDING REALTIME OPERATIONAL DATA & STAFF ACCOUNT");
  console.log("==========================================");

  // 1. Operating Organization
  await pool.query(`
    INSERT INTO organizations ("id", "name", "slug", "status", "createdAt", "updatedAt")
    VALUES ($1, 'ApplyCitrux Operations', 'apply-citrux', 'ACTIVE', NOW(), NOW())
    ON CONFLICT ("id") DO UPDATE SET "status" = 'ACTIVE'
  `, [operatingOrgId]);
  console.log("✓ Operating Organization confirmed.");

  // 2. Employee Staff Account in Supabase Auth
  const employeeEmail = "staff@citrux.com";
  const employeePassword = "Password123!";
  const employeeFirstName = "Sarah";
  const employeeLastName = "Chen";

  console.log(`\nCreating Employee Auth User: ${employeeEmail}...`);
  let employeeUserId;

  const { data: signUpData } = await supabase.auth.signUp({
    email: employeeEmail,
    password: employeePassword,
    options: {
      data: { firstName: employeeFirstName, lastName: employeeLastName },
    },
  });

  if (signUpData?.user) {
    employeeUserId = signUpData.user.id;
  } else {
    const { data: signInData } = await supabase.auth.signInWithPassword({
      email: employeeEmail,
      password: employeePassword,
    });
    if (signInData?.user) {
      employeeUserId = signInData.user.id;
    } else {
      const dbUser = await pool.query(`SELECT "id" FROM users WHERE "email" = $1`, [employeeEmail]);
      if (dbUser.rows.length > 0) {
        employeeUserId = dbUser.rows[0].id;
      } else {
        employeeUserId = crypto.randomUUID();
      }
    }
  }

  // 3. Upsert User & Membership for Employee
  await pool.query(`
    INSERT INTO users ("id", "email", "firstName", "lastName", "status", "createdAt", "updatedAt")
    VALUES ($1, $2, $3, $4, 'ACTIVE', NOW(), NOW())
    ON CONFLICT ("id") DO UPDATE SET "firstName" = $3, "lastName" = $4, "status" = 'ACTIVE'
  `, [employeeUserId, employeeEmail, employeeFirstName, employeeLastName]);

  await pool.query(`
    INSERT INTO memberships ("id", "organizationId", "userId", "role", "status", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), $1, $2, 'EMPLOYEE', 'ACTIVE', NOW(), NOW())
    ON CONFLICT ("organizationId", "userId") DO UPDATE SET "role" = 'EMPLOYEE', "status" = 'ACTIVE'
  `, [operatingOrgId, employeeUserId]);

  console.log(`✓ Employee account active: ${employeeEmail} (Role: EMPLOYEE)`);

  // 4. Candidate Account
  const candidateEmail = "alex.rivera@gmail.com";
  const candidatePassword = "Password123!";
  const candidateFirstName = "Alex";
  const candidateLastName = "Rivera";

  console.log(`\nCreating Candidate User: ${candidateEmail}...`);
  let candidateUserId;

  const { data: candAuthData } = await supabase.auth.signUp({
    email: candidateEmail,
    password: candidatePassword,
    options: {
      data: { firstName: candidateFirstName, lastName: candidateLastName },
    },
  });

  if (candAuthData?.user) {
    candidateUserId = candAuthData.user.id;
  } else {
    const { data: candSignIn } = await supabase.auth.signInWithPassword({
      email: candidateEmail,
      password: candidatePassword,
    });
    if (candSignIn?.user) {
      candidateUserId = candSignIn.user.id;
    } else {
      const dbCand = await pool.query(`SELECT "id" FROM users WHERE "email" = $1`, [candidateEmail]);
      if (dbCand.rows.length > 0) {
        candidateUserId = dbCand.rows[0].id;
      } else {
        candidateUserId = crypto.randomUUID();
      }
    }
  }

  await pool.query(`
    INSERT INTO users ("id", "email", "firstName", "lastName", "status", "createdAt", "updatedAt")
    VALUES ($1, $2, $3, $4, 'ACTIVE', NOW(), NOW())
    ON CONFLICT ("id") DO UPDATE SET "firstName" = $3, "lastName" = $4, "status" = 'ACTIVE'
  `, [candidateUserId, candidateEmail, candidateFirstName, candidateLastName]);

  await pool.query(`
    INSERT INTO memberships ("id", "organizationId", "userId", "role", "status", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), $1, $2, 'CANDIDATE', 'ACTIVE', NOW(), NOW())
    ON CONFLICT ("organizationId", "userId") DO UPDATE SET "role" = 'CANDIDATE', "status" = 'ACTIVE'
  `, [operatingOrgId, candidateUserId]);

  // Candidate Profile
  const candRes = await pool.query(`
    INSERT INTO candidates ("id", "organizationId", "userId", "headline", "phone", "city", "state", "country", "workAuthorization", "status", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), $1, $2, 'Senior Full-Stack Engineer (TypeScript, React, Node.js, Cloud Architecture)', '+1 (415) 555-0198', 'San Francisco', 'CA', 'US', 'CITIZEN', 'ACTIVE', NOW(), NOW())
    ON CONFLICT ("userId") DO UPDATE SET "status" = 'ACTIVE', "headline" = 'Senior Full-Stack Engineer (TypeScript, React, Node.js, Cloud Architecture)'
    RETURNING "id"
  `, [operatingOrgId, candidateUserId]);
  const candidateId = candRes.rows[0].id;

  // Candidate Resume Document
  const docRes = await pool.query(`
    INSERT INTO candidate_documents ("id", "candidateId", "documentType", "title", "storagePath", "fileSizeBytes", "mimeType", "versionNumber", "isDefault", "uploadedBy", "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), $1, 'RESUME', 'Alex_Rivera_Senior_FullStack_2026.pdf', 'tenants/00000000-0000-0000-0000-000000000001/candidates/alex/documents/resume-v1.pdf', 245120, 'application/pdf', 1, true, $2, NOW(), NOW())
    RETURNING "id"
  `, [candidateId, candidateUserId]);
  const documentId = docRes.rows[0].id;
  console.log(`✓ Candidate profile ready: ${candidateFirstName} ${candidateLastName} (${candidateEmail})`);

  // 5. Seed Real Job Listings
  console.log("\nSeeding Live Job Listings...");
  const job1Res = await pool.query(`
    INSERT INTO jobs ("id", "organizationId", "title", "companyName", "jobDescription", "location", "isRemote", "employmentType", "salaryMin", "salaryMax", "salaryCurrency", "source", "externalUrl", "status", "createdById", "createdAt", "updatedAt")
    VALUES (
      gen_random_uuid(),
      $1,
      'Senior Full-Stack Engineer',
      'Stripe',
      'About the Role:\nStripe builds economic infrastructure for the internet. As a Senior Full-Stack Engineer on our Connect Platforms team, you will design, build, and maintain high-throughput billing and payments experiences for millions of global businesses.\n\nKey Requirements:\n• 5+ years building scalable web applications using TypeScript, React, and Node.js or Ruby/Go\n• Strong foundation in database systems (PostgreSQL, distributed stores)\n• Experience designing resilient REST and GraphQL APIs\n• Track record of cross-functional execution and technical leadership',
      'San Francisco, CA',
      true,
      'FULL_TIME',
      175000,
      215000,
      'USD',
      'Stripe Careers Portal',
      'https://stripe.com/jobs/senior-full-stack-engineer-101',
      'OPEN',
      $2,
      NOW(),
      NOW()
    )
    RETURNING "id"
  `, [operatingOrgId, employeeUserId]);
  const job1Id = job1Res.rows[0].id;

  const job2Res = await pool.query(`
    INSERT INTO jobs ("id", "organizationId", "title", "companyName", "jobDescription", "location", "isRemote", "employmentType", "salaryMin", "salaryMax", "salaryCurrency", "source", "externalUrl", "status", "createdById", "createdAt", "updatedAt")
    VALUES (
      gen_random_uuid(),
      $1,
      'Staff Frontend Platform Engineer',
      'Airbnb',
      'Join the Airbnb Frontend Infrastructure team to build world-class design systems, high-performance rendering pipelines, and developer tooling utilized by hundreds of engineers across Airbnb.\n\nQualifications:\n• 7+ years of frontend expertise with modern React, Next.js, and TypeScript\n• Deep understanding of Core Web Vitals, SSR, and micro-frontend architecture\n• Proven mentorship and architectural leadership',
      'San Francisco, CA',
      true,
      'FULL_TIME',
      195000,
      240000,
      'USD',
      'Airbnb Greenhouse',
      'https://airbnb.com/careers/staff-frontend-platform-202',
      'OPEN',
      $2,
      NOW(),
      NOW()
    )
    RETURNING "id"
  `, [operatingOrgId, employeeUserId]);
  const job2Id = job2Res.rows[0].id;

  const job3Res = await pool.query(`
    INSERT INTO jobs ("id", "organizationId", "title", "companyName", "jobDescription", "location", "isRemote", "employmentType", "salaryMin", "salaryMax", "salaryCurrency", "source", "externalUrl", "status", "createdById", "createdAt", "updatedAt")
    VALUES (
      gen_random_uuid(),
      $1,
      'Senior Systems & Operations Engineer',
      'Linear',
      'Linear is creating the issue tracking and product development system of the future. We are seeking a Senior Systems Engineer to optimize cloud operations, multi-tenant database clusters, and synchronization engines.\n\nRequirements:\n• Strong experience with Node.js/TypeScript, PostgreSQL, Redis, and AWS/Fly.io\n• Experience with real-time distributed sync protocols\n• High autonomy and attention to craft',
      'Remote',
      true,
      'FULL_TIME',
      165000,
      205000,
      'USD',
      'Linear Careers',
      'https://linear.app/careers/senior-systems-engineer',
      'OPEN',
      $2,
      NOW(),
      NOW()
    )
    RETURNING "id"
  `, [operatingOrgId, employeeUserId]);
  const job3Id = job3Res.rows[0].id;
  console.log("✓ Jobs created: Stripe, Airbnb, Linear.");

  // 6. Seed Real-time Applications in Core Operational States

  // Application 1: Stripe -> In READY status (QA passed, Candidate Approved, Ready for Employee Manual Submission!)
  const app1Res = await pool.query(`
    INSERT INTO applications ("id", "organizationId", "candidateId", "jobId", "status", "assignedEmployeeId", "approvalStatus", "approvalRequestedAt", "approvedAt", "approvedBy", "approvalNotes", "createdAt", "updatedAt")
    VALUES (
      gen_random_uuid(),
      $1,
      $2,
      $3,
      'READY',
      $4,
      'APPROVED',
      NOW() - INTERVAL '2 hours',
      NOW() - INTERVAL '30 minutes',
      $5,
      'Approved! Looks great. Please submit to Stripe Connect team.',
      NOW() - INTERVAL '1 day',
      NOW()
    )
    RETURNING "id"
  `, [operatingOrgId, candidateId, job1Id, employeeUserId, candidateUserId]);
  const app1Id = app1Res.rows[0].id;

  await pool.query(`
    INSERT INTO application_materials ("id", "applicationId", "candidateDocumentId", "documentVersion", "coverLetterText", "screeningAnswers", "isCurrent", "createdById", "createdAt")
    VALUES (
      gen_random_uuid(),
      $1,
      $2,
      1,
      'Dear Stripe Engineering Team,\n\nI am writing to express my strong enthusiasm for the Senior Full-Stack Engineer position on Connect Platforms. Over the past 7 years, I have architected high-volume payments systems handling millions of transactions monthly with sub-100ms latency.\n\nI look forward to discussing how my experience can contribute to Stripe economic infrastructure.\n\nSincerely,\nAlex Rivera',
      '{"workAuthorization": "US Citizen", "yearsExperience": 7, "sponsorshipRequired": false, "noticePeriod": "2 weeks"}'::jsonb,
      true,
      $3,
      NOW() - INTERVAL '1 day'
    )
  `, [app1Id, documentId, employeeUserId]);

  await pool.query(`
    INSERT INTO application_state_history ("id", "applicationId", "fromStatus", "toStatus", "changedById", "reason", "createdAt")
    VALUES
      (gen_random_uuid(), $1, NULL, 'DISCOVERED', $2, 'Discovered matching position on Stripe careers', NOW() - INTERVAL '1 day'),
      (gen_random_uuid(), $1, 'DISCOVERED', 'QUALIFIED', $2, 'Candidate profile highly matches requirements', NOW() - INTERVAL '20 hours'),
      (gen_random_uuid(), $1, 'QUALIFIED', 'PREPARING', $2, 'Assigned to Sarah Chen; customized cover letter', NOW() - INTERVAL '18 hours'),
      (gen_random_uuid(), $1, 'PREPARING', 'REVIEW', $2, 'Materials completed, submitted for QA', NOW() - INTERVAL '4 hours'),
      (gen_random_uuid(), $1, 'REVIEW', 'AWAITING_APPROVAL', $2, 'QA review passed 9/9 criteria', NOW() - INTERVAL '2 hours'),
      (gen_random_uuid(), $1, 'AWAITING_APPROVAL', 'READY', $3, 'Candidate explicitly approved application materials', NOW() - INTERVAL '30 minutes')
  `, [app1Id, employeeUserId, candidateUserId]);

  // Application 2: Airbnb -> In SUBMITTED status with Submission Attempt #1 record
  const app2Res = await pool.query(`
    INSERT INTO applications ("id", "organizationId", "candidateId", "jobId", "status", "assignedEmployeeId", "approvalStatus", "approvalRequestedAt", "approvedAt", "approvedBy", "createdAt", "updatedAt")
    VALUES (
      gen_random_uuid(),
      $1,
      $2,
      $3,
      'SUBMITTED',
      $4,
      'APPROVED',
      NOW() - INTERVAL '2 days',
      NOW() - INTERVAL '1 day',
      $5,
      NOW() - INTERVAL '3 days',
      NOW()
    )
    RETURNING "id"
  `, [operatingOrgId, candidateId, job2Id, employeeUserId, candidateUserId]);
  const app2Id = app2Res.rows[0].id;

  await pool.query(`
    INSERT INTO application_materials ("id", "applicationId", "candidateDocumentId", "documentVersion", "coverLetterText", "isCurrent", "createdById", "createdAt")
    VALUES (
      gen_random_uuid(),
      $1,
      $2,
      1,
      'Dear Airbnb Hiring Team,\n\nI am thrilled to apply for the Staff Frontend Platform Engineer role. Having led frontend architecture for distributed web apps, I am eager to help shape Airbnb design system and rendering performance.',
      true,
      $3,
      NOW() - INTERVAL '3 days'
    )
  `, [app2Id, documentId, employeeUserId]);

  const storagePathSample = `tenants/${operatingOrgId}/applications/${app2Id}/submissions/sub-attempt1.png`;
  await pool.query(`
    INSERT INTO application_submissions ("id", "applicationId", "attemptNumber", "submittedAt", "submittedById", "externalReference", "externalUrl", "confirmationEvidence", "storagePath", "submissionNotes", "createdAt")
    VALUES (
      gen_random_uuid(),
      $1,
      1,
      NOW() - INTERVAL '1 day',
      $2,
      'AIRBNB-GH-88291',
      'https://airbnb.com/careers/staff-frontend-platform-202',
      'Thank you for applying to Airbnb! Your application has been received by our Frontend Engineering team. Confirmation #AIRBNB-GH-88291.',
      $3,
      'Submitted directly through Airbnb Greenhouse portal.',
      NOW() - INTERVAL '1 day'
    )
  `, [app2Id, employeeUserId, storagePathSample]);

  await pool.query(`
    INSERT INTO application_state_history ("id", "applicationId", "fromStatus", "toStatus", "changedById", "reason", "createdAt")
    VALUES
      (gen_random_uuid(), $1, 'READY', 'SUBMITTED', $2, 'Manual external submission recorded in Greenhouse portal', NOW() - INTERVAL '1 day')
  `, [app2Id, employeeUserId]);

  // Application 3: Linear -> In REVIEW status (For employee to practice QA review!)
  const app3Res = await pool.query(`
    INSERT INTO applications ("id", "organizationId", "candidateId", "jobId", "status", "assignedEmployeeId", "approvalStatus", "createdAt", "updatedAt")
    VALUES (
      gen_random_uuid(),
      $1,
      $2,
      $3,
      'REVIEW',
      $4,
      NULL,
      NOW() - INTERVAL '1 day',
      NOW()
    )
    RETURNING "id"
  `, [operatingOrgId, candidateId, job3Id, employeeUserId]);
  const app3Id = app3Res.rows[0].id;

  await pool.query(`
    INSERT INTO application_materials ("id", "applicationId", "candidateDocumentId", "documentVersion", "coverLetterText", "isCurrent", "createdById", "createdAt")
    VALUES (
      gen_random_uuid(),
      $1,
      $2,
      1,
      'Dear Linear Team,\n\nI have followed Linear with great admiration for your product speed and craft. As a senior systems engineer, I would love to contribute to your core backend sync engine.',
      true,
      $3,
      NOW() - INTERVAL '1 day'
    )
  `, [app3Id, documentId, employeeUserId]);

  await pool.query(`
    INSERT INTO application_state_history ("id", "applicationId", "fromStatus", "toStatus", "changedById", "reason", "createdAt")
    VALUES
      (gen_random_uuid(), $1, 'PREPARING', 'REVIEW', $2, 'Materials prepared; staged for QA review', NOW() - INTERVAL '2 hours')
  `, [app3Id, employeeUserId]);

  console.log("\n✓ Operational applications created successfully:");
  console.log(`  1. Stripe App (${app1Id}): Status = READY (Ready to record submission in employee console!)`);
  console.log(`  2. Airbnb App (${app2Id}): Status = SUBMITTED (Has Attempt #1 record & evidence)`);
  console.log(`  3. Linear App (${app3Id}): Status = REVIEW (Ready for QA review)`);

  console.log("\n==========================================");
  console.log("EMPLOYEE & CANDIDATE REAL-TIME LOGIN DETAILS:");
  console.log("==========================================");
  console.log("👩‍💼 EMPLOYEE ACCOUNT (Operational Staff Console):");
  console.log(`   Email:    ${employeeEmail}`);
  console.log(`   Password: ${employeePassword}`);
  console.log("   Role:     EMPLOYEE");
  console.log("   Access:   /employee, /employee/applications, /employee/tasks, /employee/jobs");
  console.log("");
  console.log("👨‍💻 CANDIDATE ACCOUNT (Candidate Portal):");
  console.log(`   Email:    ${candidateEmail}`);
  console.log(`   Password: ${candidatePassword}`);
  console.log("   Role:     CANDIDATE");
  console.log("   Access:   /candidate, /candidate/applications, /candidate/profile");
  console.log("==========================================");
}

main()
  .catch(console.error)
  .finally(() => pool.end());
