"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <main>
      <button onClick={() => signIn("github", { callbackUrl: "/projects" })}>
        Sign in with GitHub
      </button>
    </main>
  );
}
