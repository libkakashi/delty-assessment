import {clerkMiddleware, createRouteMatcher} from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/trpc(.*)',
]);

export default clerkMiddleware(async (auth, request) => {
  // Skip auth protection during build when keys aren't available
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return;
  }

  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
