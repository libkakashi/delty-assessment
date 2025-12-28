import {z} from 'zod';
import {createTRPCRouter, publicProcedure} from '../trpc';

/**
 * Test router with sample procedures
 */
export const testRouter = createTRPCRouter({
  /**
   * Simple hello query
   */
  hello: publicProcedure
    .input(z.object({name: z.string().optional()}))
    .query(({input}) => {
      return {
        greeting: `Hello ${input.name ?? 'World'}!`,
      };
    }),

  /**
   * Get all test items
   */
  getAll: publicProcedure.query(() => {
    return [
      {id: 1, name: 'Test Item 1'},
      {id: 2, name: 'Test Item 2'},
      {id: 3, name: 'Test Item 3'},
    ];
  }),

  /**
   * Get test item by ID
   */
  getById: publicProcedure
    .input(z.object({id: z.number()}))
    .query(({input}) => {
      return {
        id: input.id,
        name: `Test Item ${input.id}`,
      };
    }),

  /**
   * Create a test item
   */
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
      }),
    )
    .mutation(({input}) => {
      return {
        id: Math.floor(Math.random() * 1000),
        name: input.name,
        createdAt: new Date(),
      };
    }),
});
