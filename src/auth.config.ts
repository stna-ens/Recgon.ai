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
    session({ session, token }: {
      session: { user?: { id?: string; nickname?: string } };
      token: Record<string, unknown>;
    }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.nickname = token.nickname as string;
      }
      return session;
    },
  },
  providers: [],
  session: { strategy: 'jwt' as const },
} satisfies NextAuthConfig;
