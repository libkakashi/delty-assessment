import {z} from 'zod';
import {createTRPCRouter, protectedProcedure} from '../trpc';
import {
  createDocument,
  getDocumentById,
  getDocumentsByUserId,
  updateDocument,
  updateDocumentContent,
  updateDocumentTitle,
  deleteDocument,
} from '../db/client';
import {TRPCError} from '@trpc/server';

/**
 * Documents router with protected CRUD operations
 */
export const documentsRouter = createTRPCRouter({
  /**
   * Get all documents for the authenticated user
   */
  getAll: protectedProcedure.query(async ({ctx}) => {
    const documents = await getDocumentsByUserId(ctx.userId);
    return documents;
  }),

  /**
   * Get a document by ID (only if owned by user)
   */
  getById: protectedProcedure
    .input(z.object({id: z.number()}))
    .query(async ({input, ctx}) => {
      const document = await getDocumentById(input.id);

      if (!document) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Document not found',
        });
      }

      if (document.user_id !== ctx.userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to access this document',
        });
      }

      return document;
    }),

  /**
   * Create a new document
   */
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1, 'Title is required'),
        content: z.string(),
      }),
    )
    .mutation(async ({input, ctx}) => {
      const document = await createDocument(
        ctx.userId,
        input.title,
        input.content,
      );

      if (!document) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create document',
        });
      }

      return document;
    }),

  /**
   * Update a document (title and content)
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1, 'Title is required'),
        content: z.string(),
      }),
    )
    .mutation(async ({input, ctx}) => {
      const existing = await getDocumentById(input.id);

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Document not found',
        });
      }

      if (existing.user_id !== ctx.userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this document',
        });
      }

      const document = await updateDocument(
        input.id,
        input.title,
        input.content,
      );

      return document;
    }),

  /**
   * Update only the content of a document
   */
  updateContent: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        content: z.string(),
      }),
    )
    .mutation(async ({input, ctx}) => {
      const existing = await getDocumentById(input.id);

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Document not found',
        });
      }

      if (existing.user_id !== ctx.userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this document',
        });
      }

      const document = await updateDocumentContent(input.id, input.content);

      return document;
    }),

  /**
   * Update only the title of a document
   */
  updateTitle: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1, 'Title is required'),
      }),
    )
    .mutation(async ({input, ctx}) => {
      const existing = await getDocumentById(input.id);

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Document not found',
        });
      }

      if (existing.user_id !== ctx.userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to update this document',
        });
      }

      const document = await updateDocumentTitle(input.id, input.title);

      return document;
    }),

  /**
   * Delete a document
   */
  delete: protectedProcedure
    .input(z.object({id: z.number()}))
    .mutation(async ({input, ctx}) => {
      const existing = await getDocumentById(input.id);

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Document not found',
        });
      }

      if (existing.user_id !== ctx.userId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to delete this document',
        });
      }

      await deleteDocument(input.id);

      return {success: true, id: input.id};
    }),
});
