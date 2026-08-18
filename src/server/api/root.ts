import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { domainRouter } from "~/server/api/routers/domain";
import { entryRouter } from "~/server/api/routers/entry";
import { assistRouter } from "~/server/api/routers/assist";
import { reviewRouter } from "~/server/api/routers/review";
import { statsRouter } from "~/server/api/routers/stats";
import { settingsRouter } from "~/server/api/routers/settings";
import { conjugationRouter } from "~/server/api/routers/conjugation";
import { pronunciationRouter } from "~/server/api/routers/pronunciation";
import { grammarRouter } from "~/server/api/routers/grammar";
import { worksheetRouter } from "~/server/api/routers/worksheet";
import { gamificationRouter } from "~/server/api/routers/gamification";
import { satzRouter } from "~/server/api/routers/satz";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  domain: domainRouter,
  entry: entryRouter,
  assist: assistRouter,
  review: reviewRouter,
  stats: statsRouter,
  settings: settingsRouter,
  conjugation: conjugationRouter,
  pronunciation: pronunciationRouter,
  grammar: grammarRouter,
  worksheet: worksheetRouter,
  gamification: gamificationRouter,
  satz: satzRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);

