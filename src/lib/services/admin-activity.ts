import { logSecurityEvent } from "../security/logging.ts";
import {
  getClientIpAddress,
  getRequestUserAgent,
} from "../security/request.ts";
import {
  recordSystemAuditEvent,
  type SystemAuditEventType,
} from "./system-audit.ts";

/**
 * Records an administrator's change that has already been made elsewhere
 * (in Blob storage, or at the email provider), so it cannot share a
 * transaction with its audit row. A record that cannot be written is
 * logged, and the change still stands.
 */
export async function recordAdminActivity(input: {
  event: SystemAuditEventType;
  metadata?: Record<string, unknown>;
  request: Request;
  user: { email: string; id: string };
}): Promise<void> {
  try {
    await recordSystemAuditEvent({
      actorEmail: input.user.email,
      actorUserId: input.user.id,
      event: input.event,
      ipAddress: getClientIpAddress(input.request.headers),
      metadata: input.metadata ?? null,
      userAgent: getRequestUserAgent(input.request.headers),
    });
  } catch (error) {
    logSecurityEvent("error", {
      category: "admin_audit_failure",
      message: `Could not record "${input.event}" in the audit trail.`,
      metadata: { error: error instanceof Error ? error.message : "unknown" },
      userId: input.user.id,
    });
  }
}
