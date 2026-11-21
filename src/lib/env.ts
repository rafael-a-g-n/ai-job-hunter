import { z } from "zod";

const bool = z
  .enum(["true", "false"])
  .or(z.boolean())
  .transform((v) => v === true || v === "true");

const schema = z
  .object({
    DATABASE_URL: z.string().min(1),
    APP_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    AI_PROVIDER: z.enum(["anthropic", "mock"]),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    EMBEDDINGS_PROVIDER: z.enum(["voyage", "fake"]),
    VOYAGE_API_KEY: z.string().min(1).optional(),
    STORAGE_PROVIDER: z.enum(["vercel-blob", "local"]),
    BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
    MAIL_PROVIDER: z.enum(["resend", "console"]),
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(1),
    ADZUNA_APP_ID: z.string().min(1).optional(),
    ADZUNA_APP_KEY: z.string().min(1).optional(),
    CRON_SECRET: z.string().min(1),
    TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1).optional(),
    TURNSTILE_BYPASS: bool.default(false),
    GLOBAL_DAILY_AI_BUDGET_USD: z.coerce.number().nonnegative().default(5),
  })
  .superRefine((e, ctx) => {
    const required: [boolean, keyof typeof e][] = [
      [e.AI_PROVIDER === "anthropic", "ANTHROPIC_API_KEY"],
      [e.EMBEDDINGS_PROVIDER === "voyage", "VOYAGE_API_KEY"],
      [e.STORAGE_PROVIDER === "vercel-blob", "BLOB_READ_WRITE_TOKEN"],
      [e.MAIL_PROVIDER === "resend", "RESEND_API_KEY"],
    ];
    for (const [selected, key] of required) {
      if (selected && !e[key]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required when its provider is not the fake`,
        });
      }
    }
  });

export type Env = z.infer<typeof schema>;

export function parseEnv(raw: Record<string, unknown>): Env {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${details}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Lazily validated process.env, so importing this module never throws at build time. */
export const env: Env = new Proxy({} as Env, {
  get(_t, prop: string) {
    cached ??= parseEnv(process.env);
    return cached[prop as keyof Env];
  },
});
