import { z } from "zod";
import { ValidationError } from "@/lib/errors";

export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(
      "Input validation failed",
      result.error.issues
    );
  }
  return result.data;
}

export * from "./submission.schemas";
export * from "./interview.schemas";
