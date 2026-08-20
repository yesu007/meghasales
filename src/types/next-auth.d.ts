import { DefaultSession, DefaultUser } from 'next-auth';
import { DefaultJWT } from 'next-auth/jwt';

// Every session/token consumer used to read role/permissions/id via
// `session.user as any` because these fields aren't part of NextAuth's
// default shape. This augmentation makes them real, typed fields instead.
declare module 'next-auth' {
  interface Session {
    user: {
      // Matches what authorize() actually returns (String(user.id)) — every
      // consumer does parseInt(session.user.id, 10) when it needs a number.
      id: string;
      roles: string[];
      permissions: string[];
    } & DefaultSession['user'];
  }

  interface User extends DefaultUser {
    id: string;
    roles: string[];
    permissions: string[];
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
    roles: string[];
    permissions: string[];
  }
}
