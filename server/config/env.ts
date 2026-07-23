import "dotenv/config";
import { z } from "zod";

const optionalString = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
); // can be optional but if present, must be a string

const optionalUrl = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().url().optional(),
); // can be optional but if present, must be a url

const booleanFromEnvironment = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  if (value.toLowerCase() === "true") {
    return true;
  }

  if (value.toLowerCase() === "false") {
    return false;
  }

  return value;
}, z.boolean()); // example: "true" (string) to true (boolean)

const positiveInteger = (defaultValue: number) =>
  z.coerce.number().int().positive().default(defaultValue);

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    DATABASE_URL: z
      .string()
      .trim()
      .min(1, "DATABASE_URL is required")
      .refine(
        (value) =>
          value.startsWith("postgres://") ||
          value.startsWith("postgresql://"),
        "DATABASE_URL must be a PostgreSQL connection URL",
      ),
    JWT_SECRET: z.string().trim().min(1, "JWT_SECRET is required"),
    JWT_ISSUER: z.string().trim().min(1).default("nushub-api"),
    JWT_AUDIENCE: z.string().trim().min(1).default("nushub-web"),
    JWT_EXPIRES_IN: z
      .string()
      .regex(
        /^\d+[smhd]$/,
        "JWT_EXPIRES_IN must use a value such as 30m, 12h, or 7d",
      )
      .default("7d"),
    CLIENT_URL: z.string().url(),
    GOOGLE_CLIENT_ID: optionalString,
    R2_ACCOUNT_ID: optionalString,
    R2_ACCESS_KEY_ID: optionalString,
    R2_SECRET_ACCESS_KEY: optionalString,
    R2_BUCKET_NAME: optionalString,
    R2_PUBLIC_BASE_URL: optionalUrl,
    AI_ENABLED: booleanFromEnvironment.default(false),
    AI_PROVIDER: z.literal("gemini").default("gemini"),
    GEMINI_API_KEY: optionalString,
    AI_GENERATION_MODEL: z.string().trim().min(1).default("gemini-3.6-flash"),
    AI_EMBEDDING_MODEL: z
      .string()
      .trim()
      .min(1)
      .default("gemini-embedding-001"),
    AI_INTERACTIONS_STORE: booleanFromEnvironment.default(false),
    AI_REQUEST_TIMEOUT_MS: positiveInteger(20_000),
    AI_MAX_INPUT_CHARS: positiveInteger(2_000),
    AI_MAX_OUTPUT_TOKENS: positiveInteger(800),
    AI_MAX_TOOL_CALLS: positiveInteger(3),
    AI_MAX_CONCURRENT_REQUESTS_PER_USER: positiveInteger(1),
    AI_DAILY_REQUEST_LIMIT_PER_USER: positiveInteger(50),
  })
  .superRefine((environment, context) => {
    if (
      environment.NODE_ENV === "production" &&
      environment.JWT_SECRET.length < 32
    ) {
      context.addIssue({
        code: "custom",
        message:
          "JWT_SECRET must contain at least 32 characters in production",
        path: ["JWT_SECRET"],
      });
    }

    const r2RequiredFields = [
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET_NAME",
    ] as const;
    const configuredR2Fields = r2RequiredFields.filter(
      (field) => environment[field],
    );

    if (
      configuredR2Fields.length > 0 &&
      configuredR2Fields.length < r2RequiredFields.length
    ) {
      for (const field of r2RequiredFields) {
        if (!environment[field]) {
          context.addIssue({
            code: "custom",
            message: `${field} is required when Cloudflare R2 is configured`,
            path: [field],
          });
        }
      }
    }

    if (environment.AI_ENABLED && !environment.GEMINI_API_KEY) {
      context.addIssue({
        code: "custom",
        message: "GEMINI_API_KEY is required when AI_ENABLED=true",
        path: ["GEMINI_API_KEY"],
      });
    }

    if (environment.AI_INTERACTIONS_STORE) {
      context.addIssue({
        code: "custom",
        message:
          "AI_INTERACTIONS_STORE must remain false unless a privacy review approves provider-side storage",
        path: ["AI_INTERACTIONS_STORE"],
      });
    }
  }); // ensure all environment variables are present and valid

// checks if an object is environment-like, if not, throw error
export function parseEnvironment(input: NodeJS.ProcessEnv) {
  const parsedEnvironment = environmentSchema.safeParse(input);

  if (!parsedEnvironment.success) {
    const problems = parsedEnvironment.error.issues
      .map((issue) => {
        const field = issue.path.join(".") || "environment";
        return `- ${field}: ${issue.message}`;
      })
      .join("\n");

    throw new Error(`Invalid server environment configuration:\n${problems}`);
  }

  return parsedEnvironment.data;
}

export const env = Object.freeze(parseEnvironment(process.env)); // exporting trusted config
export type ServerEnvironment = typeof env;
