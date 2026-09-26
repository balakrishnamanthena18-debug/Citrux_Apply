Yes — this should also be converted from a **placeholder** into the **full authoritative V1 PRD**, just like the Product Vision.

Based on the V1 boundary we already established, I would use the following as the authoritative document:

`docs/01_V1_PRD.md`

````markdown
# OOS — V1 Product Requirements Document

> **Status:** Authoritative Product Requirements
>
> **Classification:** Product Management
>
> **Document Type:** Product Requirements Document
>
> **Product:** Operations Operating System (OOS)
>
> **Version:** 1.3.0
>
> **Date:** 2026-09-23
>
> **Authority:** Product / Executive Leadership

---

# 1. Executive Summary

The Operations Operating System (OOS) V1 is the first operational implementation of the company's long-term operating-system vision.

V1 establishes a controlled system for operating the company's initial managed job-application service.

The system provides a shared operational foundation for:

- Candidates
- Employees
- Jobs
- Applications
- Tasks
- Application preparation
- Quality assurance
- Candidate approvals
- Submission tracking
- Communication
- Notifications
- Audit history
- Administration
- Privacy requests

V1 is intentionally limited.

The purpose of V1 is not to implement the complete long-term OOS vision.

The purpose is to establish a reliable operational system of record for the core managed job-application process and validate that the company can execute that process through a unified platform.

---

# 2. Product Objective

The primary objective of V1 is:

> **Enable the company to manage the complete controlled lifecycle of a candidate job application through one operational system of record.**

The system must provide clear visibility into:

- Who the candidate is
- What the candidate wants
- Which jobs are being managed
- Which applications exist
- Who owns the work
- What stage each application is in
- What work remains
- What requires review
- What requires candidate approval
- What has been submitted
- What evidence exists
- What happened historically

---

# 3. V1 Product Hypothesis

The V1 hypothesis is:

> If the company's core managed job-application process is represented in one controlled operational system, employees can execute work more consistently, candidates can receive greater transparency, and management can obtain reliable operational visibility.

V1 validation must determine whether the system improves actual operational execution rather than merely functioning technically.

---

# 4. V1 Validation Model

V1 has two separate completion concepts.

### Functional Completion

The system satisfies the defined V1 product and engineering requirements.

### Operational Validation

The company has operated the system with real users and real applications sufficiently to evaluate whether the product improves the intended business process.

Functional completion does not automatically constitute operational validation.

---

# 5. V1 Validation Trigger

A formal V1 validation review is triggered at the earliest occurrence of:

- Approximately **30 real candidates**
- Approximately **100 real applications**
- **6 weeks after the production pilot begins**

The review must occur within **5 business days** of the trigger.

---

# 6. Validation Owner

The validation review is owned by:

> **Operations Manager / Designated OOS Product Owner**

The owner is responsible for collecting operational evidence and presenting the V1 decision.

---

# 7. V1 Validation Decision

The validation review must result in exactly one of:

### CONTINUE V1

The product requires continued operation without a material scope expansion.

### APPROVE V1.1

Evidence supports introducing an approved next capability.

### REWORK V1

Material operational problems require correction before expansion.

No V1.1 capability should be approved solely because the validation trigger has been reached.

---

# 8. V1 Users

V1 supports exactly three operational roles:

1. Candidate
2. Employee
3. Admin

Team Lead and Manager roles are outside V1.

---

# 9. Candidate Role

The Candidate is the customer receiving the managed job-application service.

The candidate can:

- Maintain career information
- Provide job preferences
- Manage documents
- Review applications
- Approve applications
- Communicate with the company
- Receive notifications
- Review service activity
- Submit information requests
- Submit privacy requests

The candidate cannot directly perform employee operational actions.

---

# 10. Employee Role

The Employee is responsible for operational execution.

Employees can:

- View assigned candidates
- Review candidate information
- Manage jobs
- Create and manage applications
- Prepare application materials
- Perform QA
- Request candidate approval
- Submit approved applications
- Record submission evidence
- Manage operational tasks
- Communicate with candidates
- Update application status

Employees cannot perform administrative functions unless explicitly granted the required permission.

---

# 11. Admin Role

The Admin provides operational and system administration.

Admin capabilities include:

- Employee management
- Candidate management
- Role/access administration
- Candidate reassignment
- Application oversight
- Audit review
- Privacy request handling
- Operational administration
- System configuration required by V1

Admin access must remain controlled and auditable.

---

# 12. V1 Modules

V1 consists of:

1. Authentication infrastructure
2. Organization foundation
3. Role and access control
4. Candidate management
5. Career profile
6. Truth/source-of-record model
7. Resume and document management
8. Consent management
9. Candidate portal
10. Employee workspace
11. Job management
12. Application management
13. Application preparation
14. QA
15. Candidate approval
16. Manual submission tracking
17. Submission evidence
18. Submission correction
19. Task management
20. Communication
21. Email notifications
22. Audit history
23. Admin console
24. Privacy request handling

---

# 13. V1 Golden Path

The primary V1 operating flow is:

```text
Candidate Created
      ↓
Career Profile
      ↓
Candidate Verification
      ↓
Job Added
      ↓
Job Qualified
      ↓
Application Created
      ↓
Application Preparation
      ↓
QA
      ↓
Candidate Approval
      ↓
Ready
      ↓
Manual External Submission
      ↓
Submission Evidence
      ↓
Application Tracking
````

Every stage must be represented in the system.

---

# 14. Authentication

V1 requires authenticated access.

Authentication infrastructure must support the three V1 roles.

Authentication must:

* Establish user identity
* Establish authenticated sessions
* Protect private data
* Prevent unauthorized access

Authentication implementation must follow the approved engineering security architecture.

---

# 15. Organization Foundation

V1 must establish an organization boundary.

Operational records must belong to the appropriate organization.

Users must not be able to access another organization's operational data.

The organization identifier must never be trusted solely from client-provided input.

---

# 16. Role and Access Control

V1 authorization must be enforced server-side.

Access must be based on:

* Authenticated identity
* Role
* Organization
* Resource ownership or assignment
* Required permission

The system must not rely on hidden UI controls as authorization.

Authorization must be enforced before protected operations execute.

---

# 17. Candidate Management

The system must allow authorized employees/admins to:

* Create candidates
* View candidates
* Update candidate information
* Assign candidates
* Reassign candidates
* Review candidate status

Candidate records must maintain operational history.

---

# 18. Career Profile

The candidate career profile is the canonical source of candidate career information.

It may contain:

* Personal information
* Professional summary
* Work experience
* Education
* Skills
* Projects
* Certifications
* Work authorization
* Location
* Salary expectations
* Career preferences

The profile must distinguish verified information from information requiring verification where applicable.

---

# 19. Source-of-Truth Model

The source-of-truth hierarchy is:

```text
Candidate-provided facts
        ↓
Canonical Candidate Profile
        ↓
Application Snapshot
        ↓
External Submission
        ↓
Audit History
```

Later changes to the candidate profile must not silently modify historical applications.

An application must preserve the exact information and material versions used for that application.

---

# 20. Truthfulness Requirement

The system must not intentionally fabricate candidate information.

The following must never be invented:

* Employment
* Education
* Skills
* Certifications
* Projects
* Responsibilities
* Achievements
* Experience
* Work authorization

Presentation may be improved.

Facts may not be fabricated.

---

# 21. Resume and Document Management

V1 supports candidate documents including:

* Resumes
* Cover letters
* Supporting documents
* Career-related files

Documents must support version awareness.

Applications must preserve the exact document version used.

A later resume update must not rewrite historical submission records.

---

# 22. Consent Management

Consent is a first-class V1 requirement.

The system must record:

* Consent scope
* Consent version
* Timestamp
* Granting user
* Revocation
* Audit history

Consent must control whether an application may progress toward external submission.

---

# 23. Consent Revocation

Consent revocation has deterministic behavior.

If consent is revoked:

```text
Consent Revoked
      ↓
Any application not externally submitted
      ↓
WITHDRAWN
      ↓
Submission prohibited
```

This applies regardless of whether the application is:

* DISCOVERED
* QUALIFIED
* PREPARING
* REVIEW
* AWAITING_APPROVAL
* READY

Applications already externally submitted remain historical records.

No employee may advance a withdrawn application toward external submission.

The candidate must explicitly grant consent again before future authorized application activity can proceed.

Previously withdrawn applications remain historical withdrawn records unless a new authorized workflow explicitly creates/reopens one according to defined business rules.

---

# 24. Candidate Portal

The V1 candidate portal provides access to:

* Home / Action Center
* Career Profile
* Applications
* Documents
* Messages
* Notifications
* Approvals
* Service status
* Settings

The candidate should be able to identify:

* What requires action
* What is in progress
* What has been completed
* What is waiting
* What has been submitted

---

# 25. Candidate Action Center

The candidate home experience should prioritize actions.

Examples:

* Verify career information
* Approve application
* Provide missing information
* Review a message
* Review a document
* Respond to an operational request

The interface should avoid unnecessary dashboard complexity.

---

# 26. Employee Workspace

Employees require a dedicated operational workspace.

The workspace should provide:

* Assigned candidates
* Applications
* Tasks
* Jobs
* QA work
* Approvals
* Messages

Employees should be able to identify their highest-priority operational work without relying on external trackers.

---

# 27. Employee Identity and Access

Employees must have individual accounts.

Credential sharing is prohibited.

Employee actions must remain attributable to the individual employee.

Employee access must be revoked when the employee is deactivated.

---

# 28. Employee Deactivation

When an employee is deactivated:

1. Access is revoked immediately.
2. The employee cannot access candidate/application data.
3. The employee cannot perform operational actions.
4. Incomplete assigned tasks become available for reassignment by an authorized administrator.
5. Completed historical actions remain permanently attributed to the original employee.
6. Audit history must not be rewritten.

The system must not transfer historical attribution to another employee.

---

# 29. Job Management

V1 supports controlled manual job entry and management.

A job record may contain:

* Company
* Job title
* Job description
* Location
* Employment type
* Salary information where available
* Source
* External URL
* Status
* Qualification information

V1 does not require automated job discovery.

---

# 30. V1 Job Scope

V1 explicitly supports:

* Manual job creation
* Job review
* Job qualification
* Linking jobs to applications

V1 does not include:

* Job scraping
* Automated job-board ingestion
* ATS ingestion
* Automated job deduplication
* Automated job matching

---

# 31. Application Management

Every candidate/job relationship that proceeds into the managed process must have an application record.

Applications must contain:

* Candidate
* Job
* Owner
* Status
* Relevant documents
* Application answers
* Approval state
* Submission information
* Audit history

---

# 32. V1 Application State Machine

The authoritative V1 application states are:

```text
DISCOVERED
QUALIFIED
PREPARING
REVIEW
AWAITING_APPROVAL
READY
SUBMITTED
SUBMISSION_ISSUE
REVIEW_REQUIRED
CORRECTION_APPROVED
RESUBMISSION
REJECTED
WITHDRAWN
FAILED
```

State transitions must be controlled server-side.

Invalid transitions must be rejected.

---

# 33. Application Preparation

Application preparation may include:

* Resume selection
* Resume customization
* Cover-letter preparation
* Screening-question preparation
* Application information preparation

V1 preparation must remain truthful.

Prepared materials must be reviewable before submission.

---

# 34. Quality Assurance

Applications must pass required QA before external submission.

QA should verify applicable areas including:

* Candidate-job alignment
* Resume accuracy
* Job requirements
* Salary
* Location
* Work authorization
* Screening answers
* Application completeness
* Candidate authorization

A failed QA review must prevent inappropriate progression toward submission.

---

# 35. Candidate Approval

Where candidate approval is required, the application must enter:

```text
AWAITING_APPROVAL
```

The candidate must explicitly approve before the application becomes eligible for submission.

The system must record:

* Approval identity
* Approval timestamp
* Application version/state
* Relevant audit event

---

# 36. Manual Submission

V1 uses manual external submission.

An employee may submit an application externally only when all required controls have passed.

The system must not automate external browser submission in V1.

The system must record the resulting submission internally.

---

# 37. Submission Evidence

After submission, the employee must record appropriate evidence.

Evidence may include:

* Submission timestamp
* External application reference
* External URL
* Confirmation identifier
* Confirmation screenshot/document where appropriate
* Submission notes

The exact evidence requirements are defined by the operational process.

---

# 38. Submission Correction

A submission must never be silently overwritten.

Where a problem is discovered after submission:

```text
SUBMITTED
    ↓
SUBMISSION_ISSUE
    ↓
REVIEW_REQUIRED
    ↓
CORRECTION_APPROVED
    ↓
RESUBMISSION
    ↓
SUBMITTED
```

The original submission record remains preserved.

The correction and resubmission history must remain auditable.

---

# 39. Task Management

Tasks are an operational backbone of V1.

V1 tasks may include:

### Candidate Tasks

* Complete profile
* Upload document
* Verify information
* Approve application
* Provide missing information

### Job Tasks

* Review job
* Qualify job

### Application Tasks

* Prepare resume
* Prepare cover letter
* Prepare screening answers
* Complete application
* Verify application
* Submit application

### QA Tasks

* Resume QA
* Application QA
* Submission QA

### Operational Tasks

* Candidate assignment
* Candidate reassignment
* Escalation handling

---

# 40. Task Statuses

V1 task statuses are:

```text
BACKLOG
ASSIGNED
IN_PROGRESS
WAITING
READY_FOR_REVIEW
QA
COMPLETED
BLOCKED
CANCELED
REASSIGNED
ESCALATED
```

Tasks must maintain ownership and status history.

---

# 41. Communication

V1 provides first-class communication between candidates and employees.

Communication must be associated with the appropriate candidate and, where applicable, application.

The system must distinguish:

### Candidate-visible messages

Messages visible to the candidate.

### Internal notes

Internal operational information not visible to the candidate.

Internal notes must never accidentally appear in candidate-visible communication.

---

# 42. Notifications

V1 supports transactional notifications for important operational events.

Examples:

* Candidate assignment
* Candidate information request
* Application approval request
* Application submission
* Application status change
* Operational message
* Important QA issue

Email is a notification channel.

The system must maintain the relevant operational event regardless of whether email delivery succeeds.

---

# 43. Email

V1 uses a controlled transactional email identity.

Email credentials must remain server-side.

The application must not expose SMTP credentials to browser code.

Email delivery failures must be recorded as operational failures rather than silently ignored.

---

# 44. Audit History

Important V1 actions must create audit records.

Examples:

* Candidate created
* Candidate assigned
* Candidate reassigned
* Candidate information updated
* Consent granted
* Consent revoked
* Job created
* Job qualified
* Application created
* Application status changed
* QA completed
* Candidate approval
* Submission
* Submission issue
* Correction
* Employee deactivation
* Privacy request
* Data export
* Data correction
* Data deletion

Audit history must be append-oriented and must not be silently rewritten.

---

# 45. Privacy Requests

V1 supports manual/admin-assisted privacy requests.

Supported request types include:

* Data export
* Data correction
* Data deletion

V1 does not require a fully automated self-service privacy engine.

---

# 46. Privacy Request Workflow

The V1 privacy workflow is:

```text
Candidate Request
        ↓
Privacy Request Created
        ↓
Identity Verification
        ↓
Scope Determination
        ↓
Admin / Designated Owner Review
        ↓
Export / Correction / Deletion
        ↓
Required Records Preserved
        ↓
Request Completed
        ↓
Audit Event
```

---

# 47. Privacy Events

Relevant privacy events include:

```text
PRIVACY_REQUEST_CREATED
PRIVACY_REQUEST_VERIFIED
DATA_EXPORTED
DATA_CORRECTION_COMPLETED
DATA_DELETION_COMPLETED
PRIVACY_REQUEST_COMPLETED
```

Deletion must not automatically imply destruction of records that must legally or operationally be preserved.

Retention and deletion rules must be documented before production pilot.

---

# 48. Admin Console

V1 administration provides controlled visibility and operational management.

Admin capabilities include:

* Employee management
* Candidate management
* Assignment/reassignment
* Application oversight
* Audit history
* Privacy requests
* Operational configuration required by V1

Admin actions must be auditable.

---

# 49. Database Foundation

V1 requires a relational data model supporting:

* Organization
* Users
* Roles
* Candidates
* Employees
* Jobs
* Applications
* Tasks
* Documents
* Consent
* Messages
* Notifications
* QA
* Audit events
* Privacy requests

The exact schema is defined by the applicable engineering specification.

---

# 50. Multi-Tenancy Foundation

The system must establish organization-level data boundaries.

Every organization-scoped record must belong to an organization.

Cross-organization access must be prevented.

The application must not rely solely on client-provided organization identifiers.

---

# 51. Security Requirements

V1 must enforce:

* Server-side authorization
* Organization isolation
* Least privilege
* Secure sessions
* Protected secrets
* Secure document access
* Input validation
* Auditability
* Controlled administrative access

Sensitive credentials must never be exposed to client-side code.

---

# 52. Performance Requirements

V1 should provide a responsive operational experience.

The system should prioritize:

* Server-side data retrieval where appropriate
* Minimal client JavaScript
* Indexed database queries
* Pagination for large datasets
* Avoidance of N+1 queries
* Efficient application state loading
* Controlled API calls

Performance should be measured using actual production behavior.

---

# 53. Mobile Candidate Experience

The candidate experience must be mobile-friendly.

The candidate should be able to perform important actions from a mobile device.

Priority mobile actions include:

* Reviewing applications
* Approving applications
* Responding to requests
* Reading messages
* Reviewing notifications
* Updating relevant profile information

A native mobile application is not part of V1.

---

# 54. Design Principles

The V1 product should feel like a professional enterprise product.

Design should prioritize:

* Clarity
* Hierarchy
* Consistency
* Speed
* Accessibility
* Trust
* Focus
* Operational usefulness

The product should not look like a generic AI dashboard.

Avoid unnecessary:

* Decorative gradients
* Excessive animation
* Artificial-looking AI visuals
* Dashboard clutter
* Excessive cards
* Vanity metrics

The interface should feel intentionally designed rather than automatically generated.

---

# 55. Observability

V1 should provide sufficient technical observability to diagnose:

* Application errors
* API failures
* Database failures
* Email failures
* Authentication infrastructure problems
* Unexpected runtime failures

Sensitive information must not appear in logs.

---

# 56. Testing Requirements

V1 must include automated testing for critical behavior.

Testing must cover:

* Authentication boundaries
* Authorization
* Organization isolation
* Candidate operations
* Application state transitions
* Consent revocation
* Employee deactivation
* Submission correction
* Privacy workflows
* Audit events
* Communication boundaries

The critical golden path must have end-to-end verification before production pilot.

---

# 57. Golden-Path Verification

The complete operational path must be verified:

```text
Candidate
   ↓
Career Profile
   ↓
Job
   ↓
Application
   ↓
Preparation
   ↓
QA
   ↓
Candidate Approval
   ↓
Submission
   ↓
Evidence
   ↓
Audit
```

The system must demonstrate that each step produces the correct operational state and history.

---

# 58. Required V1 End-to-End Scenarios

At minimum, V1 verification must cover:

### Scenario 1 — Golden Path

Candidate → Job → Application → Preparation → QA → Approval → Submission → Evidence.

### Scenario 2 — Consent Revocation

Consent revoked before submission → Application withdrawn → Submission prohibited.

### Scenario 3 — Employee Deactivation

Employee deactivated → Access revoked → Work reassigned → Historical attribution preserved.

### Scenario 4 — Submission Correction

Submitted application → Issue → Review → Approved correction → Resubmission → Historical record preserved.

### Scenario 5 — Privacy Request

Candidate privacy request → Verification → Admin handling → Completion → Audit event.

---

# 59. V1 Data Protection

The system must minimize unnecessary personal data.

Data access should be limited to authorized users.

Documents must be protected.

Sensitive information must not be included in logs.

Production data must not be copied into development environments without appropriate controls.

---

# 60. Backup and Recovery

Production data must have an appropriate backup and recovery strategy before production pilot.

The company must understand:

* Backup frequency
* Recovery process
* Recovery responsibility
* Data restoration process
* Failure handling

The exact infrastructure implementation is defined by engineering.

---

# 61. Production Security Gate

V1 must not enter production pilot until required security controls have been reviewed.

The production security gate includes:

* Authentication
* Authorization
* Organization isolation
* Secret protection
* Database security
* Document security
* Auditability
* Privacy handling
* Backup/recovery readiness

---

# 62. Pilot Privacy Readiness Gate

Before real candidate data is introduced, the company must establish:

* Applicable privacy obligations
* Data retention approach
* Privacy request handling
* Consent handling
* Deletion/correction handling
* Access controls
* Data protection procedures

The system must not rely on an assumption that technical functionality alone satisfies legal requirements.

---

# 63. Functional Completion

V1 is functionally complete when:

1. All approved V1 modules are implemented.
2. Required application states work correctly.
3. Required permissions are enforced.
4. Critical workflows pass verification.
5. Required audit events are produced.
6. Required privacy workflows work.
7. Required security controls pass.
8. Production build succeeds.
9. Critical automated tests pass.

Functional completion does not equal operational validation.

---

# 64. Operational Validation

V1 becomes operationally validated only after the company has operated the system with real users and real work.

Validation evaluates:

* Operational reliability
* Candidate experience
* Employee usability
* Application quality
* Execution speed
* Task completion
* Communication
* Error frequency
* Operational bottlenecks
* Business impact

---

# 65. V1.1 Decision Framework

A V1.1 capability should require evidence.

A proposed feature should demonstrate:

1. A real customer problem or operational bottleneck.
2. Evidence that the problem is meaningful.
3. Expected measurable improvement.
4. Defined owner.
5. Acceptable implementation risk.
6. Compatibility with the OOS Product Vision.

No feature should enter V1.1 solely because it was included in the long-term Product Vision.

---

# 66. Explicit V1 Exclusions

The following are explicitly outside V1:

### Job Discovery

* Automated job scraping
* Job-board ingestion
* ATS ingestion
* Automated job deduplication
* Automated job matching

### AI

* Automated job matching
* Automated resume generation
* Automated resume tailoring
* Automated cover-letter generation
* Automated screening-answer generation
* Autonomous AI application submission

### Application Automation

* Browser automation
* Automated external application submission
* Autonomous candidate impersonation

### Portfolio

* Portfolio builder
* Automated portfolio publishing

### Commercial

* Billing
* Subscriptions
* Payment gateway
* Usage billing
* Automated payment processing

### Management

* Team Lead dashboard
* Manager dashboard
* Workforce optimization
* Automatic employee assignment

### Workflow

* Configurable workflow builder
* General-purpose workflow engine
* Advanced automation engine

### Operations

* SLA engine
* Escalation engine
* Advanced workforce management

### Candidate Lifecycle

* Interview management
* Offer management
* Advanced recruiter-response management

### Support

* Support ticketing
* Knowledge base

### Intelligence

* Fraud engine
* Advanced anomaly detection
* Advanced operational analytics
* System-health command center
* Feature-flag administration

### Platforms

* Native mobile application
* Fully automated privacy engine
* Self-service privacy center

---

# 67. V1 Product Boundary Principle

If a capability is not explicitly included in this V1 PRD, it must not be assumed to be part of V1 merely because it appears in the Product Vision.

If implementation requires a new material product decision, the implementation must stop until Product / Executive Leadership provides that decision.

---

# 68. V1 Product Principles

### 68.1 Operational Truth

The system must represent the real operational state.

### 68.2 Candidate Control

Candidates retain control over their information and required approvals.

### 68.3 Employee Accountability

Every operational action must remain attributable.

### 68.4 No Fabrication

The company must never fabricate candidate career information.

### 68.5 Traceability

Critical operations must have an auditable history.

### 68.6 Controlled Progression

Applications cannot bypass required operational controls.

### 68.7 Explicit State

Important processes must use explicit states rather than informal assumptions.

### 68.8 Secure by Default

Sensitive information must be protected from the beginning.

### 68.9 Minimal V1

Only capabilities required to operate and validate the core process belong in V1.

### 68.10 Evidence Before Expansion

Operational evidence determines the next product expansion.

---

# 69. Definition of Done

V1 is complete only when:

* Product requirements are implemented.
* Engineering specifications are satisfied.
* Security controls are verified.
* Critical workflows pass.
* Audit history is functional.
* Consent behavior is deterministic.
* Employee deactivation behavior is deterministic.
* Submission correction behavior is deterministic.
* Privacy request workflow works.
* Required tests pass.
* Production build passes.
* Production security gate passes.
* Pilot privacy readiness gate passes.
* Human product acceptance is recorded.

---

# 70. Product Acceptance

V1 requires explicit Product / Executive Leadership acceptance.

Engineering completion does not constitute Product acceptance.

Acceptance must confirm:

* V1 scope
* V1 behavior
* User experience
* Operational readiness
* Validation plan

---

# 71. Change Control

This PRD is an authoritative Product Management document.

Engineering agents may not modify this document to resolve implementation ambiguity.

Material product changes require:

1. Product / Executive Leadership approval
2. PRD version update
3. Change documentation
4. Review of affected engineering specifications
5. Review of affected ADRs where applicable

---

# 72. Relationship to Product Vision

The Product Vision defines the long-term direction of OOS.

This document defines the controlled V1 boundary.

```text
OOS Product Vision
        ↓
OOS V1 PRD
        ↓
V1 Engineering Specifications
        ↓
Implementation
        ↓
Verification
        ↓
Operational Validation
        ↓
V1.1 Decision
```

---

# 73. Relationship to Phase 0

Phase 0 is the engineering foundation.

Phase 0 does not implement the V1 business capabilities described in this document.

Phase 1 begins only after:

* Product Vision is authoritative.
* V1 PRD is authoritative.
* Required Phase 1 engineering specification is approved.
* Required engineering gates are satisfied.

---

# 74. V1 North Star

The V1 North Star is:

> **Operate the managed job-application process through one trusted, auditable operational system.**

The candidate should know what is happening.

The employee should know what to do.

The administrator should know what is happening across the operation.

The system should preserve the truth of what happened.

---

# 75. Final V1 Definition

OOS V1 is:

> **A secure operational system that allows the company to manage candidates, jobs, applications, preparation, QA, approvals, submissions, tasks, communication, administration, and audit history through one controlled system of record.**

V1 is deliberately smaller than the long-term OOS vision.

Its purpose is to establish the operational foundation and validate the core business process before the company expands the system.

---

# 76. Authority

**Document Owner:** Product / Executive Leadership

**Classification:** Product Management

**Status:** Authoritative Product Requirements

**Version:** 1.3.0

**Date:** 2026-09-23

Engineering is responsible for implementing approved requirements.

Engineering does not own product scope.

Automated implementation agents do not own product decisions.

---

# 77. Final Product Principle

> **Build the smallest complete operational system that can reliably run the company's core process.**
>
> **Validate it with real work.**
>
> **Use evidence to determine what comes next.**
>
> **Do not confuse technical capability with product necessity.**

````

### Recommended document hierarchy

After you accept this, your authoritative structure becomes:

```text
OOS PRODUCT GOVERNANCE
│
├── 00_PRODUCT_VISION.md
│       └── Long-term product direction
│
├── 01_V1_PRD.md
│       └── V1 product contract
│
└── engineering/
        ├── PHASE_00_FOUNDATION_SPEC.md
        ├── PHASE_01_IDENTITY_RBAC_SPEC.md
        ├── PHASE_02_CANDIDATE_SPEC.md
        ├── PHASE_03_APPLICATION_SPEC.md
        └── ...
````

And separately:

```text
decisions/
└── ADRs/
    ├── ADR-001
    ├── ADR-002
    ├── ADR-003
    ├── ADR-004
    └── ADR-005
```

**One important gate:** don't let Antigravity mark this PRD `Authoritative` just because it created the file. **You/Product Leadership must explicitly accept the content first.** After that, it becomes the source of truth for Phase 1 product implementation.
