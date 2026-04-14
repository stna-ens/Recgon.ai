import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  callbacks: {
    jwt({ token, user, trigger, session }: {
      token: Record<string, unknown>;
      user?: { id?: string; nickname?: string; avatarUrl?: string };
      trigger?: string;
      session?: { nickname?: string; avatarUrl?: string };
    }) {
      if (user) {
        token.id = user.id;
        token.nickname = user.nickname;
        token.avatarUrl = user.avatarUrl;
      }
      if (trigger === 'update') {
        if (session?.nickname !== undefined) token.nickname = session.nickname;
        if (session?.avatarUrl !== undefined) token.avatarUrl = session.avatarUrl;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        const u = session.user as { id?: string; nickname?: string; avatarUrl?: string };
        u.id = token.id as string;
        u.nickname = token.nickname as string;
        u.avatarUrl = token.avatarUrl as string | undefined;
      }
      return session;
    },
  },
  providers: [],
  session: { strategy: 'jwt' as const },
} satisfies NextAuthConfig;
