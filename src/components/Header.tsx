'use client';

import {SignInButton, SignUpButton, UserButton, useUser} from '@clerk/nextjs';

export default function Header() {
  const {isSignedIn, user} = useUser();

  return (
    <header className="border-b">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">delty test</h1>
        <div className="flex items-center gap-4">
          {isSignedIn ? (
            <div className="flex items-center gap-2">
              <span className="text-sm">
                {user?.primaryEmailAddress?.emailAddress}
              </span>
              <UserButton />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <SignInButton mode="modal">
                <button className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900">
                  Sign In
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="px-4 py-2 text-sm font-medium bg-black text-white rounded hover:bg-gray-800">
                  Sign Up
                </button>
              </SignUpButton>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
