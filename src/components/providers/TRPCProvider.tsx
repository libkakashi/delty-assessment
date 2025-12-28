'use client';

import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {httpLink, loggerLink} from '@trpc/client';
import {createTRPCReact} from '@trpc/react-query';
import {useState} from 'react';
import {useAuth} from '@clerk/nextjs';
import superjson from 'superjson';

// only importing the type, cannot import any runtime code from ~/server directory into the client
import type {AppRouter} from '~/server/root';

export const trpc = createTRPCReact<AppRouter>();

export function TRPCProvider({children}: {children: React.ReactNode}) {
  const {getToken} = useAuth();
  const [queryClient] = useState(() => new QueryClient());

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        loggerLink({
          enabled: opts =>
            process.env.NODE_ENV === 'development' ||
            (opts.direction === 'down' && opts.result instanceof Error),
        }),
        httpLink({
          url: '/api/trpc',
          transformer: superjson,
          async headers() {
            const token = await getToken();
            return {
              Authorization: token ? `Bearer ${token}` : '',
            };
          },
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
