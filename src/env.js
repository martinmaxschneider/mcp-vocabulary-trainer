import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().min(1),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    OPENAI_API_KEY: z.string(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_NATIVE_LANG: z
      .enum(["de", "en", "es", "fr", "pt", "gsw"])
      .default("de"),
    /** Comma-separated target langs, e.g. "en,es,fr". Empty = all except native. */
    NEXT_PUBLIC_TARGET_LANGS: z
      .string()
      .optional()
      .refine(
        (val) => {
          if (!val) return true;
          const codes = val
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const allowed = new Set(["de", "en", "es", "fr", "pt", "gsw"]);
          return (
            codes.length > 0 && codes.every((code) => allowed.has(code))
          );
        },
        {
          message:
            'NEXT_PUBLIC_TARGET_LANGS must be a comma-separated list of: de, en, es, fr, pt, gsw (e.g. "en,es,fr")',
        },
      ),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    NEXT_PUBLIC_NATIVE_LANG: process.env.NEXT_PUBLIC_NATIVE_LANG,
    NEXT_PUBLIC_TARGET_LANGS: process.env.NEXT_PUBLIC_TARGET_LANGS,
  },

  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});

