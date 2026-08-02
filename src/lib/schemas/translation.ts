import { z } from "zod";

export const conjugationsSchema = z
  .object({
    present: z.array(z.string()).optional(),
    past: z.array(z.string()).optional(),
    perfect: z.array(z.string()).optional(),
    future: z.array(z.string()).optional(),
    conditional: z.array(z.string()).optional(),
    imperfect: z.array(z.string()).optional(),
    pluperfect: z.array(z.string()).optional(),
  })
  .optional();
