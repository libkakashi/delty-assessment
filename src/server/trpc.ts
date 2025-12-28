import {initTRPC, TRPCError} from '@trpc/server';
import {ZodError} from 'zod';
import superjson from 'superjson';
import {auth} from '@clerk/nextjs/server';

/**
 * Context for tRPC requests
 * Includes Clerk authentication
 */
export const createTRPCContext = async (opts: {headers: Headers}) => {
  const authData = await auth();
  const userId = authData.userId;

  return {
    ...opts,
    userId: userId || null,
    auth: authData,
  };
};

/**
 * Initialize tRPC
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({shape, error}) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Export reusable router and procedure helpers
 */
export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

/**
 * Protected procedure that requires authentication
 */
export const protectedProcedure = t.procedure.use(async ({ctx, next}) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Authentication required',
    });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
    },
  });
});
