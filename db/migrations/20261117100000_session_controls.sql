-- Session controls: how long a signed-in session may sit unused, and how
-- long it may last at most, both set by an administrator.
--
-- * session.last_active_at: when the session was last used, in seconds,
--   written at most once a minute. Null until the first use after this
--   migration, which counts from when the session was created.
-- * app_settings.session_idle_minutes: minutes without use before a session
--   ends. Null means sessions do not end for being idle.
-- * app_settings.session_max_hours: hours after sign-in when a session ends
--   whatever happens. Null means Better Auth's 7 days.

alter table public.session
  add column if not exists last_active_at bigint;

alter table public.app_settings
  add column if not exists session_idle_minutes integer
    check (session_idle_minutes is null or session_idle_minutes between 5 and 1440),
  add column if not exists session_max_hours integer
    check (session_max_hours is null or session_max_hours between 1 and 168);
