import {createTRPCReact} from '@trpc/react-query';
import {createTRPCClient, httpLink, loggerLink} from '@trpc/client';
import superjson from 'superjson';
import {AppRouter} from '~/server/root';

const API_URL = '/api';

const config = (ctx?: {getToken: () => Promise<string | null>}) => ({
  links: [
    loggerLink({
      enabled: opts =>
        process.env.NODE_ENV === 'development' ||
        (opts.direction === 'down' && opts.result instanceof Error),
    }),
    httpLink({
      transformer: superjson,
      url: API_URL + '/trpc',
      fetch: async (url, opts) =>
        await fetch(url, {
          ...opts,
          headers: ctx
            ? {
                ...opts?.headers,
                Authorization: 'Bearer ' + (await ctx.getToken()),
              }
            : opts?.headers,
        }),
    }),
  ],
});

export const apiHooks = createTRPCReact<AppRouter>();
export const api = createTRPCClient<AppRouter>(config());

export const createReactClient = (ctx: {
  getToken: () => Promise<string | null>;
}) => apiHooks.createClient(config(ctx));
