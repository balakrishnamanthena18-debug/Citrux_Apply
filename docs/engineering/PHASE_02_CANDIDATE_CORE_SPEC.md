# Phase 2 Engineering Specification: Candidate Core

## 1. Document Control
- **Document Title**: Phase 2 Engineering Specification — Candidate Core
- **Document Version**: 1.2.0
- **Status**: DRAFT — PENDING FINAL HUMAN APPROVAL
- **Author**: Antigravity Assistant (AI)
- **Authority**: Human Product / Engineering Authority
- **Target File**: `docs/engineering/PHASE_02_CANDIDATE_CORE_SPEC.md`
- **Implementation Status**: **NOT AUTHORIZED**

### Revision History
| Version | Date | Description | Author |
| :--- | :--- | :--- | :--- |
| 1.0.0 | 2026-09-24 | Initial authoring of Phase 2 Candidate Core specification. | Antigravity AI |
| 1.1.0 | 2026-09-24 | Resolution of document storage (Supabase Storage), deletion/erasure model, and lifecycle states. | Antigravity AI |
| 1.2.0 | 2026-09-24 | Resolution of final human decisions: candidate assignment operational scope (not an authorization boundary), candidate lifecycle state machine & transitions, and minimal candidate-provided skill model (`name` only). | Antigravity AI |
| Addendum v1.1.0 | 2026-09-25 | Addendum: Ratified Optional Candidate Approval & Managed Application Authorization. Added `applicationAuthorizationMode` (`MANAGED` \| `REVIEW_REQUIRED`) to Candidate model with `MANAGED` default and immutable audit events (`CANDIDATE_MANAGED_AUTHORIZATION_GRANTED`, `CANDIDATE_AUTHORIZATION_MODE_CHANGED`). | Human Acceptance Gate |

---

## 2. Phase Objective
The objective of Phase 2 (**Candidate Core**) is to establish the canonical, trustworthy, auditable, and tenant-isolated **Candidate Record** and **Career Profile** within the Operations Operating System (OOS). 

The candidate record serves as the authoritative operational source of candidate data for downstream job-matching, resume preparation, application packaging, and operational workflows introduced in later phases.

---

## 3. Scope
Phase 2 defines the engineering contract for:
1. **Candidate Operational Entity**: Primary `Candidate` entity linked to internal `User` and scoped to the operating `Organization`.
2. **Canonical Career Profile**: Structured representations of candidate summary, work experience, education, skills, projects, certifications, work authorization, location, salary expectations, and career preferences.
3. **Candidate Lifecycle & Status**: Explicit operational state machine (`ONBOARDING`, `ACTIVE`, `INACTIVE`, `ARCHIVED`) and locked transition rules.
4. **Operational Candidate Assignment**: Manual assignment and reassignment of candidates to staff members for workload allocation and ownership (strictly decoupled from authorization boundaries).
5. **Verification State Model**: Profile-level and section-level verification metadata distinguishing candidate self-reported facts from employee-verified facts.
6. **Candidate Document Metadata & Storage**: Metadata tracking and private Supabase Storage bucket integration for uploaded resumes, cover letters, and career documents with immutable version references.
7. **Candidate Audit Events**: Comprehensive audit tracking for all candidate profile creations, updates, verifications, status changes, assignments, and corrections.
8. **Server-Side Authorization & RLS**: Strict tenant isolation and role-based policies governing Candidate, Employee, and Admin access under `oos_app_runtime`.
9. **Zod Validation Schemas**: Authoritative server-side validation for all candidate profile inputs.
10. **Server Actions Contract**: Explicit server-side transaction boundaries for candidate profile management.
11. **UI / UX Requirements**: Candidate self-service profile portal and Employee/Admin operational candidate consoles.
12. **Testing Strategy**: Objective integration and unit testing specifications for candidate data boundaries and operations.

---

## 4. Authority
This specification derives its authority strictly from:
1. Explicit human instructions
2. Approved Product Vision (`docs/00_PRODUCT_VISION.md`)
3. Approved V1 PRD (`docs/01_V1_PRD.md`)
4. Accepted Phase 0 Engineering Specification (`docs/engineering/00_PHASE_0_ENGINEERING_SPEC.md`) and Phase 0 ADRs (ADR-001 through ADR-005)
5. Accepted Phase 1 Engineering Specification (`docs/engineering/PHASE_01_IDENTITY_RBAC_SPEC.md` v1.5.0)
6. Accepted Phase 1 Implementation

---

## 5. Candidate Domain Model
A **Candidate** is an operational customer business record belonging to the company's operating organization. 

The domain model encompasses:
- **Candidate Entity**: Core operational anchor linking identity, tenancy, status, operational assignment, and profile facts.
- **Career Profile**: Canonical factual dataset representing the candidate's professional background.
- **Profile Sections (V1 PRD §18)**:
  - Personal Information & Location (Location, contact phone, LinkedIn, GitHub, portfolio URL)
  - Professional Summary (Headline, summary overview, total years of experience)
  - Work Experience (Employer, title, start date, end date, is_current, location, achievements, technologies)
  - Education (Institution, degree, field of study, graduation year, GPA/honors optional)
  - Skills (Candidate-provided skill records containing skill `name`)
  - Projects (Project title, role, URL, description, highlights, technologies)
  - Certifications (Name, issuing authority, issue date, expiration date, credential ID/URL)
  - Work Authorization (Country, visa status, sponsorship required, visa details)
  - Preferences & Expectations (Target roles, target locations, remote preference, desired salary minimum/maximum, currency)
- **Verification Metadata**: Flags, notes, and timestamps indicating whether specific facts have been verified against source documents.
- **Document Metadata**: References to candidate-provided file artifacts stored in private Supabase Storage buckets.

---

## 6. User / Candidate Relationship
In the OOS architecture:
- **`User` (Phase 1)**: Represents the authentication identity and account credentials (mapped 1:1 to Supabase Auth `auth.users.id`), holding basic name, email, and global user status.
- **`Membership` (Phase 1)**: Associates a `User` with an `Organization` under a specific `Role` (`CANDIDATE`, `EMPLOYEE`, `ADMIN`).
- **`Candidate` (Phase 2)**: The operational business entity created when a user with role `CANDIDATE` joins the operating organization.

### Architectural Invariants:
1. **1:1 Mapping per Organization**: A `User` with role `CANDIDATE` in an `Organization` has exactly one `Candidate` record in that organization (`userId` is unique per candidate within the organization).
2. **Separation of Concerns**: Operational candidate attributes (skills, experience, preferences, verification state) MUST NOT reside in Supabase Auth user metadata or the `users` table.
3. **Tenancy Binding**: `Candidate.organizationId` MUST equal `Membership.organizationId` and match the server configuration `OPERATING_ORGANIZATION_ID`.

---

## 7. Candidate Data Model

### 7.1 Field Classification Against V1 PRD
Every field in the candidate data model is justified directly by the approved V1 PRD:
- `phone`, `city`, `state`, `country`, `postalCode`, `timezone`: **REQUIRED BY V1** (V1 PRD §18: Personal information & Location).
- `linkedinUrl`, `githubUrl`, `portfolioUrl`: **SUPPORTED BY V1** (V1 PRD §18: Personal information & URLs).
- `headline`, `professionalSummary`, `totalYearsExperience`: **REQUIRED BY V1** (V1 PRD §18: Professional summary).
- `workAuthorization`, `requiresSponsorship`, `visaDetails`: **REQUIRED BY V1** (V1 PRD §18: Work authorization).
- `targetRoles`, `targetLocations`, `remotePreference`, `desiredSalaryMin`, `desiredSalaryMax`, `salaryCurrency`: **REQUIRED BY V1** (V1 PRD §18: Salary expectations & Career preferences).
- `verificationStatus`, `verifiedAt`, `verifiedBy`, `verificationNotes`: **REQUIRED BY V1** (V1 PRD §18: Distinguish verified vs unverified).
- `assignedEmployeeId`: **REQUIRED BY V1** (V1 PRD §17: Manual candidate assignment & reassignment for operational allocation).

### 7.2 Prisma Schema Specification

```prisma
enum CandidateStatus {
  ONBOARDING
  ACTIVE
  INACTIVE
  ARCHIVED
}

enum VerificationStatus {
  UNVERIFIED
  PENDING_REVIEW
  VERIFIED
  REJECTED
}

enum WorkAuthorizationStatus {
  CITIZEN
  PERMANENT_RESIDENT
  WORK_VISA
  STUDENT_VISA
  REQUIRES_SPONSORSHIP
  OTHER
}

enum RemotePreference {
  REMOTE_ONLY
  HYBRID
  ONSITE
  FLEXIBLE
}

model Candidate {
  id                   String                  @id @default(uuid()) @db.Uuid
  organizationId       String                  @db.Uuid
  userId               String                  @unique @db.Uuid
  assignedEmployeeId   String?                 @db.Uuid
  status               CandidateStatus         @default(ONBOARDING)
  verificationStatus   VerificationStatus      @default(UNVERIFIED)
  
  // Contact & Location (V1 PRD §18)
  phone                String?                 @db.VarChar(50)
  city                 String?                 @db.VarChar(100)
  state                String?                 @db.VarChar(100)
  country              String                  @default("US") @db.VarChar(100)
  postalCode           String?                 @db.VarChar(20)
  timezone             String?                 @db.VarChar(50)
  linkedinUrl          String?                 @db.VarChar(500)
  githubUrl            String?                 @db.VarChar(500)
  portfolioUrl         String?                 @db.VarChar(500)
  
  // Professional Summary (V1 PRD §18)
  headline             String?                 @db.VarChar(255)
  professionalSummary  String?                 @db.Text
  totalYearsExperience Decimal?                @db.Decimal(4, 1)
  
  // Work Authorization (V1 PRD §18)
  workAuthorization    WorkAuthorizationStatus @default(CITIZEN)
  requiresSponsorship  Boolean                 @default(false)
  visaDetails          String?                 @db.VarChar(255)
  
  // Preferences & Compensation Expectations (V1 PRD §18)
  targetRoles          String[]                @default([])
  targetLocations      String[]                @default([])
  remotePreference     RemotePreference        @default(FLEXIBLE)
  desiredSalaryMin     Int?
  desiredSalaryMax     Int?
  salaryCurrency       String                  @default("USD") @db.VarChar(10)
  
  // Operational & Verification Tracking (V1 PRD §17, §18)
  verifiedAt           DateTime?               @db.Timestamptz(6)
  verifiedBy           String?                 @db.Uuid
  verificationNotes    String?                 @db.Text
  
  // Timestamps
  createdAt            DateTime                @default(now()) @db.Timestamptz(6)
  updatedAt            DateTime                @updatedAt @db.Timestamptz(6)

  // Relationships
  organization         Organization            @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user                 User                    @relation(fields: [userId], references: [id], onDelete: Cascade)
  assignedEmployee     User?                   @relation("AssignedCandidateEmployee", fields: [assignedEmployeeId], references: [id], onDelete: SetNull)
  verifier             User?                   @relation("CandidateVerifier", fields: [verifiedBy], references: [id], onDelete: SetNull)
  
  experiences          CandidateExperience[]
  educations           CandidateEducation[]
  skills               CandidateSkill[]
  projects             CandidateProject[]
  certifications       CandidateCertification[]
  documents            CandidateDocument[]

  @@index([organizationId, status])
  @@index([assignedEmployeeId, status])
  @@index([verificationStatus])
  @@map("candidates")
}

model CandidateExperience {
  id              String    @id @default(uuid()) @db.Uuid
  candidateId     String    @db.Uuid
  companyName     String    @db.VarChar(200)
  jobTitle        String    @db.VarChar(200)
  location        String?   @db.VarChar(100)
  isCurrent       Boolean   @default(false)
  startDate       DateTime  @db.Date
  endDate         DateTime? @db.Date
  description     String?   @db.Text
  achievements    String[]  @default([])
  technologies    String[]  @default([])
  orderIndex      Int       @default(0)
  createdAt       DateTime  @default(now()) @db.Timestamptz(6)
  updatedAt       DateTime  @updatedAt @db.Timestamptz(6)

  candidate       Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)

  @@index([candidateId, orderIndex])
  @@map("candidate_experiences")
}

model CandidateEducation {
  id             String    @id @default(uuid()) @db.Uuid
  candidateId    String    @db.Uuid
  institution    String    @db.VarChar(255)
  degree         String    @db.VarChar(200)
  fieldOfStudy   String?   @db.VarChar(200)
  startDate      DateTime? @db.Date
  endDate        DateTime? @db.Date
  graduationYear Int?
  gpa            String?   @db.VarChar(20)
  honors         String?   @db.VarChar(255)
  orderIndex     Int       @default(0)
  createdAt      DateTime  @default(now()) @db.Timestamptz(6)
  updatedAt      DateTime  @updatedAt @db.Timestamptz(6)

  candidate      Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)

  @@index([candidateId, orderIndex])
  @@map("candidate_educations")
}

model CandidateSkill {
  id              String    @id @default(uuid()) @db.Uuid
  candidateId     String    @db.Uuid
  name            String    @db.VarChar(100) // Candidate-provided skill name
  createdAt       DateTime  @default(now()) @db.Timestamptz(6)
  updatedAt       DateTime  @updatedAt @db.Timestamptz(6)

  candidate       Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)

  @@unique([candidateId, name], name: "candidate_skill_unique")
  @@index([candidateId])
  @@map("candidate_skills")
}

model CandidateProject {
  id           String    @id @default(uuid()) @db.Uuid
  candidateId  String    @db.Uuid
  title        String    @db.VarChar(200)
  role         String?   @db.VarChar(100)
  url          String?   @db.VarChar(500)
  description  String?   @db.Text
  highlights   String[]  @default([])
  technologies String[]  @default([])
  startDate    DateTime? @db.Date
  endDate      DateTime? @db.Date
  orderIndex   Int       @default(0)
  createdAt    DateTime  @default(now()) @db.Timestamptz(6)
  updatedAt    DateTime  @updatedAt @db.Timestamptz(6)

  candidate    Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)

  @@index([candidateId, orderIndex])
  @@map("candidate_projects")
}

model CandidateCertification {
  id                String    @id @default(uuid()) @db.Uuid
  candidateId       String    @db.Uuid
  name              String    @db.VarChar(200)
  issuingAuthority  String    @db.VarChar(200)
  credentialId      String?   @db.VarChar(200)
  credentialUrl     String?   @db.VarChar(500)
  issueDate         DateTime? @db.Date
  expirationDate    DateTime? @db.Date
  doesNotExpire     Boolean   @default(false)
  createdAt         DateTime  @default(now()) @db.Timestamptz(6)
  updatedAt         DateTime  @updatedAt @db.Timestamptz(6)

  candidate         Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)

  @@index([candidateId])
  @@map("candidate_certifications")
}

enum DocumentType {
  RESUME
  COVER_LETTER
  TRANSCRIPT
  CERTIFICATE
  OTHER
}

model CandidateDocument {
  id             String       @id @default(uuid()) @db.Uuid
  candidateId    String       @db.Uuid
  documentType   DocumentType @default(RESUME)
  title          String       @db.VarChar(255)
  storagePath    String       @db.VarChar(1024) // Path in private Supabase Storage bucket
  fileSizeBytes  Int
  mimeType       String       @db.VarChar(100)
  versionNumber  Int          @default(1)
  isDefault      Boolean      @default(false)
  uploadedBy     String       @db.Uuid
  createdAt      DateTime     @default(now()) @db.Timestamptz(6)
  updatedAt      DateTime     @updatedAt @db.Timestamptz(6)

  candidate      Candidate    @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  uploader       User         @relation(fields: [uploadedBy], references: [id], onDelete: Restrict)

  @@index([candidateId, documentType, isDefault])
  @@map("candidate_documents")
}
```

---

## 8. Source of Truth
The specification strictly enforces the V1 PRD source-of-truth hierarchy (V1 PRD §19, §20):

```text
Candidate-provided facts
        ↓
Canonical Candidate Profile
        ↓
Application Snapshot (Phase 3+)
        ↓
External Submission (Phase 3+)
        ↓
Audit History
```

### Invariants:
1. **Truthfulness Guarantee (V1 PRD §20)**: The system must never invent or synthesize facts (employment, degrees, skills, credentials).
2. **Fact Attribution**: Direct candidate inputs are recorded as self-reported facts.
3. **Staff Verification**: Staff cannot silently overwrite candidate self-reported facts. Any corrections or verifications must record the verifying employee ID, timestamp, and verification status.
4. **Historical Immutability**: Changes made to the canonical `Candidate` profile after an application is generated (in later phases) will never mutate historical application snapshots.

---

## 9. Candidate Lifecycle
Candidate records transition through strict operational states locked by human product decision:

```text
[Registration] ──► ONBOARDING ──► ACTIVE ◄──► INACTIVE ──► ARCHIVED
```

### 9.1 State Definitions

- **`ONBOARDING`**: Candidate record exists, but onboarding/profile establishment is in progress.
- **`ACTIVE`**: Candidate is an active operational customer record eligible to participate in normal operations.
- **`INACTIVE`**: Candidate remains a valid historical/customer record, but active operational processing is paused.
- **`ARCHIVED`**: Candidate is operationally archived and cannot participate in active operations.

### 9.2 Locked State Transition Matrix

| Source State | Target State | Permitted Actors | Pre-conditions / Business Rules | Audit Action |
| :--- | :--- | :--- | :--- | :--- |
| `ONBOARDING` | `ACTIVE` | Staff, Admin | Required profile fields completed and ready for operations | `CANDIDATE_STATUS_CHANGED` |
| `ACTIVE` | `INACTIVE` | Staff, Admin | Pause operational workflows upon candidate or staff request | `CANDIDATE_STATUS_CHANGED` |
| `INACTIVE` | `ACTIVE` | Staff, Admin | Reactivate operational workflows | `CANDIDATE_STATUS_CHANGED` |
| `ACTIVE` | `ARCHIVED` | Staff, Admin | Conclude active customer relationship; retain compliance history | `CANDIDATE_STATUS_CHANGED` |
| `INACTIVE` | `ARCHIVED` | Staff, Admin | Move paused candidate into permanent historical archive | `CANDIDATE_STATUS_CHANGED` |

*Prohibited Transitions*:
- `ARCHIVED` → `ACTIVE` (Prohibited without explicit future approval)
- `ARCHIVED` → `INACTIVE` (Prohibited)
- `ARCHIVED` → `ONBOARDING` (Prohibited)

---

## 10. Candidate Access & Assignment Contract

### 10.1 Access Model & Authorization Scope
Candidate access boundaries are determined strictly by **Organization Membership and Role** (Phase 1):
- **Candidate User**:
  - Unrestricted READ on own `Candidate` record, profile sections, and documents.
  - UPDATE on own contact info, summary, experience, education, skills, projects, certifications, preferences, and documents while status is `ONBOARDING` or `ACTIVE`.
  - CANNOT read or mutate any other candidate's record.
  - CANNOT modify `verificationStatus`, `verifiedBy`, `assignedEmployeeId`, or `status`.
- **Employee User**:
  - READ on all candidates within the operating organization.
  - UPDATE on candidate verification status, verification notes, and manual assignment.
  - CANNOT hard delete candidate records.
- **Admin User**:
  - Full administrative READ, UPDATE, ASSIGN, and ARCHIVE across all organization candidates.

### 10.2 Operational Assignment Contract (LOCKED DECISION)
- **Operational Ownership**: Assignment identifies the specific employee responsible for candidate workload and operational processing.
- **Decoupled from Authorization**: Assignment MUST NOT become an authorization boundary.
  - An authorized employee retains organization-scoped candidate READ access regardless of whether they are assigned.
  - Assigned employee $\neq$ only authorized employee.
  - Unassigned employee $\neq$ unauthorized employee.
  - Assignment does NOT grant access across organizations.
  - Assignment does NOT reduce organization-level access for an otherwise authorized employee.
- **Manual Assignment Only**: Assignment and reassignment are executed manually by authorized staff/admins. Automatic assignment algorithms and workforce management optimization are explicitly excluded (V1 PRD §66).

---

## 11. Authorization Matrix

| Action | Candidate (Self) | Candidate (Other) | Employee | Admin |
| :--- | :---: | :---: | :---: | :---: |
| `candidate:create_self` | Allowed (Onboarding) | Denied | N/A | N/A |
| `candidate:read_self` | Allowed | Denied | Allowed | Allowed |
| `candidate:update_self` | Allowed (`ONBOARDING`/`ACTIVE`) | Denied | Denied | Denied |
| `candidate:read_all` | Denied | Denied | Allowed (Org-wide) | Allowed (Org-wide) |
| `candidate:assign` | Denied | Denied | Allowed | Allowed |
| `candidate:verify` | Denied | Denied | Allowed | Allowed |
| `candidate:change_status` | Denied | Denied | Allowed (Locked transitions) | Allowed (Locked transitions) |
| `candidate:delete` | Denied | Denied | Denied | Denied (No hard deletion) |

---

## 12. Validation

### Server-Side Zod Schemas (`src/lib/validation/candidate.schemas.ts`):

```typescript
import { z } from "zod";

export const CandidateProfileSchema = z.object({
  phone: z.string().trim().max(50).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  state: z.string().trim().max(100).optional().nullable(),
  country: z.string().trim().min(2).max(100).default("US"),
  postalCode: z.string().trim().max(20).optional().nullable(),
  timezone: z.string().trim().max(50).optional().nullable(),
  linkedinUrl: z.string().trim().url().max(500).optional().nullable(),
  githubUrl: z.string().trim().url().max(500).optional().nullable(),
  portfolioUrl: z.string().trim().url().max(500).optional().nullable(),
  headline: z.string().trim().max(255).optional().nullable(),
  professionalSummary: z.string().trim().max(5000).optional().nullable(),
  totalYearsExperience: z.number().min(0).max(60).optional().nullable(),
  workAuthorization: z.enum([
    "CITIZEN",
    "PERMANENT_RESIDENT",
    "WORK_VISA",
    "STUDENT_VISA",
    "REQUIRES_SPONSORSHIP",
    "OTHER",
  ]),
  requiresSponsorship: z.boolean().default(false),
  visaDetails: z.string().trim().max(255).optional().nullable(),
  targetRoles: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  targetLocations: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
  remotePreference: z.enum(["REMOTE_ONLY", "HYBRID", "ONSITE", "FLEXIBLE"]).default("FLEXIBLE"),
  desiredSalaryMin: z.number().int().min(0).max(10000000).optional().nullable(),
  desiredSalaryMax: z.number().int().min(0).max(10000000).optional().nullable(),
  salaryCurrency: z.string().trim().min(3).max(10).default("USD"),
});

export const CandidateExperienceSchema = z.object({
  id: z.string().uuid().optional(),
  companyName: z.string().trim().min(1, "Company name is required").max(200),
  jobTitle: z.string().trim().min(1, "Job title is required").max(200),
  location: z.string().trim().max(100).optional().nullable(),
  isCurrent: z.boolean().default(false),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)").optional().nullable(),
  description: z.string().trim().max(5000).optional().nullable(),
  achievements: z.array(z.string().trim().max(500)).max(20).default([]),
  technologies: z.array(z.string().trim().max(100)).max(50).default([]),
  orderIndex: z.number().int().min(0).default(0),
});

export const CandidateEducationSchema = z.object({
  id: z.string().uuid().optional(),
  institution: z.string().trim().min(1, "Institution name is required").max(255),
  degree: z.string().trim().min(1, "Degree is required").max(200),
  fieldOfStudy: z.string().trim().max(200).optional().nullable(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  graduationYear: z.number().int().min(1950).max(2050).optional().nullable(),
  gpa: z.string().trim().max(20).optional().nullable(),
  honors: z.string().trim().max(255).optional().nullable(),
  orderIndex: z.number().int().min(0).default(0),
});

export const CandidateSkillSchema = z.object({
  name: z.string().trim().min(1, "Skill name is required").max(100),
});

export const CandidateAssignmentSchema = z.object({
  candidateId: z.string().uuid("Invalid candidate ID"),
  employeeId: z.string().uuid("Invalid employee ID").nullable(),
});

export const CandidateVerificationSchema = z.object({
  candidateId: z.string().uuid("Invalid candidate ID"),
  verificationStatus: z.enum(["VERIFIED", "REJECTED", "PENDING_REVIEW"]),
  verificationNotes: z.string().trim().max(2000).optional().nullable(),
});
```

---

## 13. Data Integrity & Deletion Model
- **No Hard Deletion (LOCKED DECISION)**: Candidate records and operational history are never hard-deleted in Phase 2. Status transitions to `INACTIVE` or `ARCHIVED` preserve relational integrity.
- **Privacy Erasure Separation**: `ARCHIVED` is a business lifecycle state. Formal data erasure requests (GDPR/CCPA) are governed separately by the V1 PRD privacy workflow (V1 PRD §59) and do not destroy immutable audit logs or historical compliance submissions.
- **Foreign Keys**: Cascading deletion from `Organization` and `User` to `Candidate`; cascading deletion from `Candidate` to child profile entities.
- **Nullability Safeguards**: Optional fields default to `NULL` or empty arrays `[]` rather than synthetic placeholders.
- **De-duplication**: Unique constraint on `CandidateSkill(candidateId, name)`.

---

## 14. Audit Requirements
Phase 2 introduces dedicated `AuditAction` enum extensions for all candidate operations:
- `CANDIDATE_CREATED`: Initial operational candidate record initialized.
- `CANDIDATE_PROFILE_UPDATED`: Candidate profile demographics, preferences, or summary updated.
- `CANDIDATE_EXPERIENCE_UPDATED`: Work experience records created, modified, or deleted.
- `CANDIDATE_EDUCATION_UPDATED`: Education records created, modified, or deleted.
- `CANDIDATE_SKILLS_UPDATED`: Skills modified.
- `CANDIDATE_DOCUMENT_UPLOADED`: Resume or supporting document uploaded.
- `CANDIDATE_DOCUMENT_DELETED`: Document metadata deleted from active profile.
- `CANDIDATE_ASSIGNED`: Candidate manually assigned or reassigned to a staff member.
- `CANDIDATE_VERIFIED`: Verification status updated by authorized employee.
- `CANDIDATE_STATUS_CHANGED`: Candidate lifecycle state changed (`ACTIVE`, `INACTIVE`, `ARCHIVED`).

---

## 15. Privacy Requirements
- **Data Subject Rights (V1 PRD §59)**: Candidate self-service endpoints allow viewing and updating personal profile data directly.
- **Privacy Minimization**: PII fields are restricted to authenticated candidate self-access and authorized staff within the operating tenant.
- **Preservation of Audit Attribution**: Deactivated or archived candidate records preserve historical actor attribution without exposing raw PII to unauthorized callers.

---

## 16. Candidate Document Storage Model (Supabase Storage)

### 16.1 Storage Architecture
- **Provider (LOCKED DECISION)**: Binary document content is stored in **Supabase Storage**; metadata is stored in PostgreSQL table `candidate_documents`.
- **Private Buckets**: Document storage buckets are strictly private (`public = false`). No public document URLs are generated.
- **Server-Side Authorization**: Upload and download URLs are generated strictly server-side using signed short-lived URLs after verifying candidate ownership or employee role.
- **Storage Path Isolation**:
  `tenants/{organizationId}/candidates/{candidateId}/documents/{documentId}-{version}.{ext}`
  - Storage paths are generated deterministically server-side; client-controlled file paths are strictly prohibited.
- **Version Awareness (V1 PRD §21)**: Uploading a new resume creates a new version record (`versionNumber += 1`). Later resume updates never overwrite historical document records.

---

## 17. API / Server Actions

### Defined Server Actions (`src/lib/candidate/actions.ts`):
1. `createCandidateProfile(input: CandidateProfileInput)`
   - **Caller**: Candidate (self)
   - **Boundary**: Transactional `withRlsContext(userId)`
   - **Operation**: Creates candidate profile record linked to operating organization.
2. `updateCandidateProfile(input: CandidateProfileInput)`
   - **Caller**: Candidate (self)
   - **Boundary**: `withRlsContext(userId)`
   - **Audit**: `CANDIDATE_PROFILE_UPDATED`
3. `upsertCandidateExperience(items: CandidateExperienceInput[])`
   - **Caller**: Candidate (self)
   - **Boundary**: `withRlsContext(userId)`
   - **Audit**: `CANDIDATE_EXPERIENCE_UPDATED`
4. `upsertCandidateEducation(items: CandidateEducationInput[])`
   - **Caller**: Candidate (self)
   - **Boundary**: `withRlsContext(userId)`
   - **Audit**: `CANDIDATE_EDUCATION_UPDATED`
5. `syncCandidateSkills(skills: CandidateSkillInput[])`
   - **Caller**: Candidate (self)
   - **Boundary**: `withRlsContext(userId)`
   - **Audit**: `CANDIDATE_SKILLS_UPDATED`
6. `assignCandidate(input: CandidateAssignmentInput)`
   - **Caller**: Employee / Admin
   - **Boundary**: `requireEmployeeOrAdmin(ctx)`, transactional `withRlsContext(userId)`
   - **Audit**: `CANDIDATE_ASSIGNED`
7. `verifyCandidate(input: CandidateVerificationInput)`
   - **Caller**: Employee / Admin
   - **Boundary**: `requireEmployeeOrAdmin(ctx)`, transactional `withRlsContext(userId)`
   - **Audit**: `CANDIDATE_VERIFIED`
8. `updateCandidateStatus(candidateId: string, status: CandidateStatus)`
   - **Caller**: Employee / Admin
   - **Boundary**: `requireEmployeeOrAdmin(ctx)`, transactional `withRlsContext(userId)`
   - **Audit**: `CANDIDATE_STATUS_CHANGED`
9. `getSignedDocumentDownloadUrl(documentId: string)`
   - **Caller**: Candidate (self for own document) or Employee/Admin
   - **Boundary**: `withRlsContext(userId)`, server-generated signed Supabase Storage URL

---

## 18. Database Requirements
- **Engine**: PostgreSQL 15+ (Supabase)
- **Runtime Connection Role**: `oos_app_runtime` (`NOSUPERUSER`, `NOBYPASSRLS`)
- **DDL Migration Ownership**: `postgres`
- **Schema Mapping**: All candidate tables mapped to snake_case table names in `public` schema.

---

## 19. RLS Requirements

### 19.1 `FORCE ROW LEVEL SECURITY`
`FORCE ROW LEVEL SECURITY` must be applied to all Phase 2 tables:
- `candidates`
- `candidate_experiences`
- `candidate_educations`
- `candidate_skills`
- `candidate_projects`
- `candidate_certifications`
- `candidate_documents`

### 19.2 RLS Helper Functions (SECURITY DEFINER)
- `candidate_belongs_to_user(target_candidate_id uuid, target_user_id uuid)`: Returns boolean indicating whether candidate belongs to user.
- `candidate_is_in_active_org(target_candidate_id uuid)`: Returns boolean indicating active organization membership.

### 19.3 RLS Policies Summary:
- **`candidates` SELECT**: `userId = current_user_id() OR is_org_privileged_member(organizationId, current_user_id())`
- **`candidates` INSERT**: `userId = current_user_id() AND is_org_member(organizationId, current_user_id())`
- **`candidates` UPDATE**: `(userId = current_user_id() AND status IN ('ONBOARDING', 'ACTIVE')) OR is_org_privileged_member(organizationId, current_user_id())`
- **Child Tables (`candidate_*`)**: Inherit access through `candidate_belongs_to_user` or `is_org_privileged_member`.

---

## 20. UI / UX Requirements

### 20.1 Candidate Self-Service Portal (`/candidate/profile`):
- Multi-section profile editor (Contact, Summary, Experience, Education, Skills, Projects, Preferences, Documents).
- Visual verification indicator badge (`Verified`, `Pending Review`, `Self-Reported`).
- In-place auto-save / save-status indicator.

### 20.2 Employee Operational Console (`/employee/candidates` & `/employee/candidates/[id]`):
- Filterable candidate directory (Search by name, email, target role, status, verification state, assigned staff).
- Candidate detail profile inspector.
- Verification modal with note-taking and verification action.
- Manual staff assignment dropdown.

---

## 21. Performance Requirements
- **Indexed Lookups**: Compound indexes on `(organizationId, status)`, `(userId)`, `(assignedEmployeeId, status)`.
- **Query Hygiene**: Deep profile fetches use single query joins or batched relational includes via Prisma with zero N+1 queries.
- **Server Components**: Candidate list and profile views rendered as React Server Components by default.

---

## 22. Error Handling
- All API and Server Action failures return standardized `SafeErrorResponse` with domain error codes:
  - `VALIDATION_ERROR` (400)
  - `AUTHENTICATION_ERROR` (401)
  - `AUTHORIZATION_ERROR` (403)
  - `NOT_FOUND` (404)
  - `CONFLICT` (409)
  - `INVALID_STATE_TRANSITION` (422)

---

## 23. Testing Strategy
Phase 2 test suite must implement:
1. **Candidate Profile Unit Tests**: Validation schema boundary tests for experience, education, skills, documents, and preferences.
2. **Candidate Authorization Tests**: Verification that candidates cannot access or mutate other candidates' profiles.
3. **RLS Policy Tests**: PostgreSQL RLS enforcement verifying cross-tenant and inter-candidate denial under `oos_app_runtime`.
4. **Lifecycle State Transition Tests**: Enforcement of allowed vs disallowed candidate status transitions.
5. **Verification Integrity Tests**: Verification that candidates cannot self-verify and that verification timestamps/actors are recorded accurately.
6. **Audit Event Tests**: Verification that every profile change records an attributable audit event.
7. **Document Storage Security Tests**: Verification that document download URLs require server-side authentication and cannot be accessed publicly.
8. **Assignment Decoupling Tests**: Verification that unassigned employees in the operating organization can read candidates, and that assignment changes produce audit events without altering authorization boundaries.

---

## 24. Security Requirements
- Zero reliance on client-supplied candidate IDs or organization IDs for authorization.
- Runtime connections restricted to non-superuser role `oos_app_runtime`.
- Document storage paths sanitized to prevent directory traversal or cross-tenant document exposure.
- Server-side validation before all database write operations.
- Supabase service-role key is never exposed to browser clients.

---

## 25. Explicit Exclusions
Phase 2 strictly EXCLUDES:
- Global Enterprise Skill Taxonomy or ontology
- Automatic employee assignment algorithms / workload balancing
- Hard deletion of candidate records
- Jobs and Job Ingestion
- Applications and Application Snapshots
- Resume tailoring / Cover letter generation
- Screening question answering
- Candidate application approval workflows
- Quality Assurance (QA) workflows
- Task execution & SLA engines
- AI / LLM processing
- Billing & Payments
- Native mobile applications
- Redis, Kafka, or worker background infrastructure

---

## 26. Acceptance Criteria
- [ ] **Criterion 1**: Candidate, CandidateExperience, CandidateEducation, CandidateSkill, CandidateProject, CandidateCertification, CandidateDocument models implemented in Prisma schema.
- [ ] **Criterion 2**: User ↔ Candidate 1:1 relationship per organization enforced.
- [ ] **Criterion 3**: PostgreSQL RLS enabled and FORCED on all Candidate tables.
- [ ] **Criterion 4**: Candidates can read and update only their own profile.
- [ ] **Criterion 5**: Staff and Admins have organization-wide candidate read visibility regardless of assignment.
- [ ] **Criterion 6**: Candidates cannot self-assign verification status or change assignment.
- [ ] **Criterion 7**: Candidate skills are stored strictly as candidate-provided `name` strings without an enterprise taxonomy.
- [ ] **Criterion 8**: Binary documents are stored in private Supabase Storage buckets with server-authorized signed URL generation.
- [ ] **Criterion 9**: Candidate records are never hard-deleted; operational status machine enforces `ONBOARDING`, `ACTIVE`, `INACTIVE`, `ARCHIVED` locked transitions.
- [ ] **Criterion 10**: Manual candidate assignment/reassignment is supported as an operational ownership tag; automatic assignment is excluded.
- [ ] **Criterion 11**: All candidate mutations produce structured audit events.
- [ ] **Criterion 12**: Zod validation enforced on all candidate inputs.
- [ ] **Criterion 13**: Unit and integration test suites pass with 100% success rate.
- [ ] **Criterion 14**: `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass cleanly with exit code 0.

---

## 27. Open Human Decisions
**NONE IDENTIFIED AT SPECIFICATION LEVEL**

All material decisions regarding document storage (Supabase Storage), skill representation (minimal candidate-provided `name` records), deletion model (no hard deletion; soft lifecycle states), candidate lifecycle transitions, and assignment scope (operational ownership decoupled from authorization boundaries) have been resolved per authoritative human guidance.

---

## 28. Implementation Gate

### STATUS:
**DRAFT — PENDING FINAL HUMAN APPROVAL**

### IMPLEMENTATION:
**NOT AUTHORIZED**

Phase 2 implementation MUST NOT begin until final human approval is explicitly granted.

---

## 29. Addendum v1.1.0 — Optional Candidate Approval & Managed Application Authorization (Ratified 2026-09-25)

**Authority Reference:** `docs/engineering/CHANGE_OPTIONAL_CANDIDATE_APPROVAL_SPEC.md` (v1.1.0, ACCEPTED — FROZEN)

### 29.1 Application Authorization Mode
The `Candidate` model is extended with:
```prisma
enum ApplicationAuthorizationMode {
  MANAGED
  REVIEW_REQUIRED
}

model Candidate {
  // ...
  applicationAuthorizationMode ApplicationAuthorizationMode @default(MANAGED)
  // ...
}
```

### 29.2 Contract Semantics
1. **Representation Consent Equivalence**: Authoritative candidate representation consent establishes the legal boundary for bounded managed application execution.
2. **Default Mode**: New and existing candidates default to `MANAGED` mode (candidate buys back time).
3. **Mode Switching**: Candidates may update their mode via `/candidate/profile` or `/candidate/privacy`. Updates emit `CANDIDATE_AUTHORIZATION_MODE_CHANGED` or `CANDIDATE_MANAGED_AUTHORIZATION_GRANTED`.
4. **Preference Boundary Preservation**: Managed authorization is strictly bounded by active candidate preferences (`desiredSalaryMin`, `remotePreference`, `authorizedLocations`, work authorization constraints).

