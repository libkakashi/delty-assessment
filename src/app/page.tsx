'use client';
import {useEffect} from 'react';
import {useUser} from '@clerk/nextjs';
import {useRouter} from 'next/navigation';

export default function Home() {
  const {isSignedIn, isLoaded} = useUser();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.push('/docs');
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-zinc-950">
        <div className="text-zinc-900 dark:text-zinc-50">Loading...</div>
      </div>
    );
  }

  if (isSignedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-zinc-950">
        <div className="text-zinc-900 dark:text-zinc-50">Redirecting...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-zinc-950">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Sign in to continue
        </h1>
      </div>
    </div>
  );
}
