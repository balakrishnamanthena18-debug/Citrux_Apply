import { z } from "zod";

export const CreateEmployeeSchema = z.object({
  email: z.string().trim().email("Invalid email address"),
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  role: z.enum(["EMPLOYEE", "ADMIN"]),
  phone: z.string().trim().max(50).optional().nullable(),
  personalEmail: z.string().trim().email("Invalid personal email address").optional().nullable(),
  designationId: z.string().uuid("Invalid designation ID format").optional().nullable(),
  department: z.string().trim().max(100).optional().nullable(),
  team: z.string().trim().max(100).optional().nullable(),
  reportingManagerId: z.string().uuid("Invalid reporting manager ID format").optional().nullable(),
  isTeamLead: z.boolean().optional(),
  teamLeadOf: z.string().trim().max(100).optional().nullable(),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "CONSULTANT"]).optional().nullable(),
  joiningDate: z.string().datetime().optional().nullable(),
  workLocation: z.string().trim().max(100).optional().nullable(),
  workMode: z.enum(["REMOTE", "HYBRID", "ONSITE"]).optional().nullable(),
});

export const CreateDesignationSchema = z.object({
  name: z.string().trim().min(1, "Designation name is required").max(100),
  code: z.string().trim().max(50).optional().nullable(),
  description: z.string().trim().max(1000).optional().nullable(),
});

export const UpdateDesignationSchema = z.object({
  designationId: z.string().uuid("Invalid designation ID format"),
  name: z.string().trim().min(1, "Designation name is required").max(100),
  code: z.string().trim().max(50).optional().nullable(),
  description: z.string().trim().max(1000).optional().nullable(),
});

export const SetDesignationStatusSchema = z.object({
  designationId: z.string().uuid("Invalid designation ID format"),
  status: z.enum(["ACTIVE", "ARCHIVED"]),
});

export const ResendStaffActivationSchema = z.object({
  membershipId: z.string().uuid("Invalid membership ID format"),
});

export const UpdateEmployeeDesignationSchema = z.object({
  membershipId: z.string().uuid("Invalid membership ID format"),
  designationId: z.string().uuid("Invalid designation ID format").nullable(),
});

export const UpdateEmployeeOrganizationSchema = z.object({
  membershipId: z.string().uuid("Invalid membership ID format"),
  department: z.string().trim().max(100).optional().nullable(),
  team: z.string().trim().max(100).optional().nullable(),
  reportingManagerId: z.string().uuid("Invalid reporting manager ID format").optional().nullable(),
  isTeamLead: z.boolean().optional(),
  teamLeadOf: z.string().trim().max(100).optional().nullable(),
});

export const SetEmployeeStatusSchema = z.object({
  employeeUserId: z.string().uuid("Invalid employee ID format"),
  status: z.enum(["ACTIVE", "INACTIVE"]),
});

export const UpdateEmployeeRoleSchema = z.object({
  employeeUserId: z.string().uuid("Invalid employee ID format"),
  role: z.enum(["EMPLOYEE", "ADMIN"]),
});

export const ReassignWorkSchema = z
  .object({
    sourceEmployeeUserId: z.string().uuid("Invalid source employee ID format").optional(),
    targetEmployeeId: z.string().uuid("Invalid target employee ID format"),
    applicationIds: z.array(z.string().uuid("Invalid application ID format")).optional(),
    taskIds: z.array(z.string().uuid("Invalid task ID format")).optional(),
    candidateIds: z.array(z.string().uuid("Invalid candidate ID format")).optional(),
    reassignCandidates: z.boolean().optional(),
    reassignApplications: z.boolean().optional(),
    reassignTasks: z.boolean().optional(),
  })
  .refine(
    (data) =>
      Boolean(
        data.sourceEmployeeUserId ||
        (data.applicationIds && data.applicationIds.length > 0) ||
        (data.taskIds && data.taskIds.length > 0) ||
        (data.candidateIds && data.candidateIds.length > 0)
      ),
    {
      message: "At least one application, task, candidate, or source employee must be specified for reassignment",
      path: ["targetEmployeeId"],
    }
  );

export const ListAuditLogsSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(25),
  actorUserId: z.string().uuid("Invalid user ID format").optional(),
  entityType: z.string().trim().optional(),
  entityId: z.string().uuid("Invalid entity ID format").optional(),
  action: z.string().trim().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const CreatePrivacyRequestSchema = z.object({
  requestType: z.enum(["DATA_EXPORT", "DATA_CORRECTION", "DATA_DELETION"]),
  scopeDetails: z.string().trim().max(2000, "Scope details too long").optional(),
});

export const VerifyPrivacyRequestSchema = z.object({
  requestId: z.string().uuid("Invalid request ID format"),
  verificationNotes: z.string().trim().min(5, "Verification notes required (min 5 characters)").max(1000),
});

export const CompletePrivacyRequestSchema = z.object({
  requestId: z.string().uuid("Invalid request ID format"),
  resolutionNotes: z.string().trim().min(5, "Resolution notes required (min 5 characters)").max(2000),
});

export const RejectPrivacyRequestSchema = z.object({
  requestId: z.string().uuid("Invalid request ID format"),
  rejectionReason: z.string().trim().min(5, "Rejection reason required (min 5 characters)").max(1000),
});

export const ListPrivacyRequestsSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  status: z.enum(["PENDING", "IDENTITY_VERIFIED", "IN_REVIEW", "COMPLETED", "REJECTED"]).optional(),
});

export type CreateEmployeeInput = z.input<typeof CreateEmployeeSchema>;
export type CreateDesignationInput = z.input<typeof CreateDesignationSchema>;
export type UpdateDesignationInput = z.input<typeof UpdateDesignationSchema>;
export type SetDesignationStatusInput = z.input<typeof SetDesignationStatusSchema>;
export type ResendStaffActivationInput = z.input<typeof ResendStaffActivationSchema>;
export type UpdateEmployeeDesignationInput = z.input<typeof UpdateEmployeeDesignationSchema>;
export type UpdateEmployeeOrganizationInput = z.input<typeof UpdateEmployeeOrganizationSchema>;
export type SetEmployeeStatusInput = z.input<typeof SetEmployeeStatusSchema>;
export type UpdateEmployeeRoleInput = z.input<typeof UpdateEmployeeRoleSchema>;
export type ReassignWorkInput = z.input<typeof ReassignWorkSchema>;
export type ListAuditLogsInput = z.input<typeof ListAuditLogsSchema>;
export type CreatePrivacyRequestInput = z.input<typeof CreatePrivacyRequestSchema>;
export type VerifyPrivacyRequestInput = z.input<typeof VerifyPrivacyRequestSchema>;
export type CompletePrivacyRequestInput = z.input<typeof CompletePrivacyRequestSchema>;
export type RejectPrivacyRequestInput = z.input<typeof RejectPrivacyRequestSchema>;
export type ListPrivacyRequestsInput = z.input<typeof ListPrivacyRequestsSchema>;
