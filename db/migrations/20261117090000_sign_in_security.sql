-- Sign-in security: two-step sign-in (an authenticator app, with backup
-- codes) and the administrator's switch that requires it of everyone.
--
-- * user."twoFactorEnabled" and the "twoFactor" table are Better Auth's
--   two-factor plugin. The secret and the backup codes are stored encrypted
--   with BETTER_AUTH_SECRET.
-- * app_settings.require_two_factor: nobody can use the app until they have
--   set up two-step sign-in. Off unless an administrator turns it on.

alter table public."user"
  add column if not exists "twoFactorEnabled" boolean not null default false;

create table if not exists public."twoFactor" (
  id text primary key,
  secret text not null,
  "backupCodes" text not null,
  "userId" text not null references public."user"(id) on delete cascade,
  verified boolean not null default true,
  "failedVerificationCount" integer not null default 0,
  "lockedUntil" timestamptz
);

create index if not exists "twoFactor_userId_idx"
  on public."twoFactor" ("userId");

create index if not exists "twoFactor_secret_idx"
  on public."twoFactor" (secret);

alter table public.app_settings
  add column if not exists require_two_factor boolean not null default false;
