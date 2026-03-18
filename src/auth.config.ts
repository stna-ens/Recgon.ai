import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  callbacks: {
    jwt({ token, user, trigger, session }: {
      token: Record<string, unknown>;
      user?: { id?: string; nickname?: string };
      trigger?: string;
      session?: { nickname?: string };
    }) {
      if (user) {
        token.id = user.id;
        token.nickname = user.nickname;
      }
      if (trigger === 'update' && session?.nickname !== undefined) {
        token.nickname = session.nickname;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string; nickname?: string }).id = token.id as string;
        (session.user as { id?: string; nickname?: string }).nickname = token.nickname as string;
      }
      return session;
    },
  },
  providers: [],
  session: { strategy: 'jwt' as const },
} satisfies NextAuthConfig;
