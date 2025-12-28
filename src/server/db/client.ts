import {Kysely, PostgresDialect} from 'kysely';
import type {DB} from './schema.generated.ts';
import {Pool} from 'pg';

const db = new Kysely<DB>({
  dialect: new PostgresDialect({
    pool: new Pool({connectionString: process.env.DATABASE_URL}),
  }),
});

export default db;

// User operations
export const createUser = async (id: string, name: string) => {
  const result = await db
    .insertInto('users')
    .values({id, name})
    .returningAll()
    .executeTakeFirst();
  return result;
};

export const getUserById = async (id: string) => {
  return await db
    .selectFrom('users')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();
};

export const upsertUser = async (id: string, name: string) => {
  const result = await db
    .insertInto('users')
    .values({id, name})
    .onConflict(oc => oc.column('id').doUpdateSet({name}))
    .returningAll()
    .executeTakeFirst();
  return result;
};

// Chat operations
export const createChat = async (userId: string, title?: string) => {
  const result = await db
    .insertInto('chats')
    .values({
      user_id: userId,
      title: title || null,
    })
    .returningAll()
    .executeTakeFirst();
  return result;
};

export const getChatById = async (chatId: number) => {
  return await db
    .selectFrom('chats')
    .selectAll()
    .where('id', '=', chatId)
    .executeTakeFirst();
};

export const getChatsByUserId = async (userId: string) => {
  return await db
    .selectFrom('chats')
    .selectAll()
    .where('user_id', '=', userId)
    .orderBy('updated_at', 'desc')
    .execute();
};

export const updateChatTitle = async (chatId: number, title: string) => {
  return await db
    .updateTable('chats')
    .set({title, updated_at: new Date()})
    .where('id', '=', chatId)
    .returningAll()
    .executeTakeFirst();
};

export const updateChatTimestamp = async (chatId: number) => {
  return await db
    .updateTable('chats')
    .set({updated_at: new Date()})
    .where('id', '=', chatId)
    .executeTakeFirst();
};

export const deleteChat = async (chatId: number) => {
  return await db.deleteFrom('chats').where('id', '=', chatId).execute();
};

// Message operations
export const insertMessage = async (
  chatId: number,
  role: string,
  content: string,
) => {
  const result = await db
    .insertInto('chat_messages')
    .values({
      chat_id: chatId,
      role,
      content,
    })
    .returningAll()
    .executeTakeFirst();
  return result;
};

export const getMessagesByChatId = async (chatId: number) => {
  return await db
    .selectFrom('chat_messages')
    .selectAll()
    .where('chat_id', '=', chatId)
    .orderBy('created_at', 'asc')
    .execute();
};

export const getLatestMessageByChatId = async (chatId: number) => {
  return await db
    .selectFrom('chat_messages')
    .selectAll()
    .where('chat_id', '=', chatId)
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst();
};

export const deleteMessagesByChatId = async (chatId: number) => {
  return await db
    .deleteFrom('chat_messages')
    .where('chat_id', '=', chatId)
    .execute();
};

// Combined operations
export const getChatWithMessages = async (chatId: number) => {
  const chat = await getChatById(chatId);
  if (!chat) return null;

  const messages = await getMessagesByChatId(chatId);
  return {
    ...chat,
    messages,
  };
};

export const createChatWithFirstMessage = async (
  userId: string,
  role: string,
  content: string,
  title?: string,
) => {
  const chat = await createChat(userId, title);
  if (!chat) throw new Error('Failed to create chat');

  const message = await insertMessage(chat.id, role, content);
  return {
    chat,
    message,
  };
};

// Document operations
export const createDocument = async (
  userId: string,
  title: string,
  content: string,
) => {
  const result = await db
    .insertInto('documents')
    .values({
      user_id: userId,
      title,
      content,
    })
    .returningAll()
    .executeTakeFirst();
  return result;
};

export const getDocumentById = async (documentId: number) => {
  return await db
    .selectFrom('documents')
    .selectAll()
    .where('id', '=', documentId)
    .executeTakeFirst();
};

export const getDocumentsByUserId = async (userId: string) => {
  return await db
    .selectFrom('documents')
    .selectAll()
    .where('user_id', '=', userId)
    .orderBy('updated_at', 'desc')
    .execute();
};

export const updateDocument = async (
  documentId: number,
  title: string,
  content: string,
) => {
  return await db
    .updateTable('documents')
    .set({title, content, updated_at: new Date()})
    .where('id', '=', documentId)
    .returningAll()
    .executeTakeFirst();
};

export const updateDocumentContent = async (
  documentId: number,
  content: string,
) => {
  return await db
    .updateTable('documents')
    .set({content, updated_at: new Date()})
    .where('id', '=', documentId)
    .returningAll()
    .executeTakeFirst();
};

export const updateDocumentTitle = async (
  documentId: number,
  title: string,
) => {
  return await db
    .updateTable('documents')
    .set({title, updated_at: new Date()})
    .where('id', '=', documentId)
    .returningAll()
    .executeTakeFirst();
};

export const deleteDocument = async (documentId: number) => {
  return await db
    .deleteFrom('documents')
    .where('id', '=', documentId)
    .execute();
};
