// The session limits an administrator can choose (session-controls.ts).
// Kept apart from that module so the settings page can list them without
// loading database code.

/** Minutes without use before a session ends. */
export const SESSION_IDLE_CHOICES = [15, 30, 60, 240, 480] as const;

/** Hours after sign-in when a session ends. 168 is Better Auth's 7 days. */
export const SESSION_MAX_HOURS_CHOICES = [8, 12, 24, 72, 168] as const;
