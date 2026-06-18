import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

/**
 * Factory: creates an Express middleware that validates req.body against a Zod schema.
 * Returns 400 with structured errors on failure.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = (result.error as ZodError).errors.map(e => ({
        field: e.path.join("."),
        message: e.message,
      }));
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "Request validation failed.",
        errors,
      });
    }
    // Replace body with parsed (coerced) data
    req.body = result.data;
    next();
  };
}
