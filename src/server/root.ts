import {createTRPCRouter} from './trpc';
import {testRouter} from './routers/test';
import {documentsRouter} from './routers/documents';

/**
 * Root tRPC router
 * This is the main router that combines all sub-routers
 */
export const appRouter = createTRPCRouter({
  test: testRouter,
  documents: documentsRouter,
});

/**
 * Export type definition of the API
 * This is used for end-to-end type safety
 */
export type AppRouter = typeof appRouter;
