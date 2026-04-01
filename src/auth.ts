import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import GitHub from 'next-auth/providers/github';
import bcrypt from 'bcryptjs';
import { getUserByEmail, findOrCreateOAuthUser, updateUser } from '@/lib/userStorage';
import { authConfig } from './auth.config';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...(process.env.GITHUB_ID && process.env.GITHUB_SECRET ? [GitHub({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
      authorization: { params: { scope: 'read:user user:email repo' } },
    })] : []),
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await getUserByEmail(credentials.email as string);
        if (!user) return null;
        if (!user.passwordHash) return null;
        const valid = await bcrypt.compare(credentials.password as string, user.passwordHash);
        if (!valid) return null;
        return { id: user.id, email: user.email, name: user.email, nickname: user.nickname, avatarUrl: user.avatarUrl } as Record<string, unknown>;
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (account?.provider !== 'github') return true;
      if (!user.email) return false;
      const existing = await findOrCreateOAuthUser(
        user.email,
        (user.name ?? user.email.split('@')[0]).slice(0, 32),
      );
      user.id = existing.id;
      (user as { nickname?: string }).nickname = existing.nickname;
      // Set avatarUrl on user object so it lands in the JWT
      const avatarUrl = user.image || existing.avatarUrl;
      (user as { avatarUrl?: string }).avatarUrl = avatarUrl;
      if (account.access_token) {
        await updateUser(existing.id, {
          githubAccessToken: account.access_token,
          ...(user.image ? { avatarUrl: user.image } : {}),
        });
      }
      return true;
    },
  },
});
