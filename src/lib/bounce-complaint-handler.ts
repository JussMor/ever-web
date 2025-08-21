import { createTursoClient } from "./turso.js";

export interface BounceEvent {
  email: string;
  bounceType: "hard" | "soft";
  bounceSubType: string;
  timestamp: Date;
  diagnosticCode?: string;
}

export interface ComplaintEvent {
  email: string;
  complaintType: "spam" | "abuse" | "fraud" | "virus" | "other";
  timestamp: Date;
  userAgent?: string;
  complaintSource?: string;
}

export interface EmailSuppressionRecord {
  email: string;
  suppressionType: "bounce" | "complaint" | "unsubscribe";
  reason: string;
  suppressedAt: Date;
  isPermanent: boolean;
}

/**
 * Advanced Bounce and Complaint Handler
 * Implements comprehensive email reputation management
 */
export class BounceComplaintHandler {
  private tursoClient;

  constructor(env?: any) {
    this.tursoClient = createTursoClient(env);
  }

  /**
   * Handle bounce events with proper categorization
   */
  async handleBounce(bounceEvent: BounceEvent): Promise<void> {
    console.log(
      `Processing bounce for ${bounceEvent.email} (${bounceEvent.bounceType})`,
    );

    try {
      // Log the bounce event
      await this.logBounceEvent(bounceEvent);

      // Determine if this should result in suppression
      const shouldSuppress = await this.shouldSuppressForBounce(bounceEvent);

      if (shouldSuppress) {
        await this.suppressEmail({
          email: bounceEvent.email,
          suppressionType: "bounce",
          reason: `${bounceEvent.bounceType} bounce: ${bounceEvent.bounceSubType}`,
          suppressedAt: new Date(),
          isPermanent: bounceEvent.bounceType === "hard",
        });
      }

      // Update bounce metrics
      await this.updateBounceMetrics(bounceEvent);
    } catch (error) {
      console.error("Error handling bounce:", error);
      throw error;
    }
  }

  /**
   * Handle complaint events
   */
  async handleComplaint(complaintEvent: ComplaintEvent): Promise<void> {
    console.log(`Processing complaint for ${complaintEvent.email}`);

    try {
      // Log the complaint event
      await this.logComplaintEvent(complaintEvent);

      // Always suppress on complaints for AWS compliance
      await this.suppressEmail({
        email: complaintEvent.email,
        suppressionType: "complaint",
        reason: `Complaint: ${complaintEvent.complaintType}`,
        suppressedAt: new Date(),
        isPermanent: true,
      });

      // Update complaint metrics
      await this.updateComplaintMetrics(complaintEvent);

      // Alert if complaint rate is getting high
      await this.checkComplaintRate();
    } catch (error) {
      console.error("Error handling complaint:", error);
      throw error;
    }
  }

  /**
   * Check if an email is suppressed
   */
  async isEmailSuppressed(email: string): Promise<{
    isSuppressed: boolean;
    reason?: string;
    suppressedAt?: Date;
    isPermanent?: boolean;
  }> {
    try {
      const result = await this.tursoClient.execute({
        sql: `
          SELECT suppression_type, reason, suppressed_at, is_permanent
          FROM email_suppressions 
          WHERE email = ? AND (is_permanent = 1 OR suppressed_at > datetime('now', '-30 days'))
          ORDER BY suppressed_at DESC
          LIMIT 1
        `,
        args: [email],
      });

      if (result.rows.length === 0) {
        return { isSuppressed: false };
      }

      const row = result.rows[0];
      return {
        isSuppressed: true,
        reason: row.reason as string,
        suppressedAt: new Date(row.suppressed_at as string),
        isPermanent: Boolean(row.is_permanent),
      };
    } catch (error) {
      console.error("Error checking email suppression:", error);
      // Err on the side of caution - consider it suppressed if we can't check
      return {
        isSuppressed: true,
        reason: "Database error - suppressed for safety",
      };
    }
  }

  /**
   * Get bounce and complaint statistics
   */
  async getEmailReputationStats(): Promise<{
    bounceRate: number;
    complaintRate: number;
    totalSent: number;
    totalBounces: number;
    totalComplaints: number;
    period: string;
  }> {
    try {
      const result = await this.tursoClient.execute({
        sql: `
          SELECT 
            COUNT(*) as total_sent,
            SUM(CASE WHEN bounce_type IS NOT NULL THEN 1 ELSE 0 END) as total_bounces,
            SUM(CASE WHEN complaint_type IS NOT NULL THEN 1 ELSE 0 END) as total_complaints
          FROM email_events 
          WHERE created_at > datetime('now', '-30 days')
        `,
      });

      const row = result.rows[0];
      const totalSent = Number(row.total_sent) || 0;
      const totalBounces = Number(row.total_bounces) || 0;
      const totalComplaints = Number(row.total_complaints) || 0;

      return {
        bounceRate: totalSent > 0 ? (totalBounces / totalSent) * 100 : 0,
        complaintRate: totalSent > 0 ? (totalComplaints / totalSent) * 100 : 0,
        totalSent,
        totalBounces,
        totalComplaints,
        period: "30 days",
      };
    } catch (error) {
      console.error("Error getting reputation stats:", error);
      throw error;
    }
  }

  /**
   * Unsubscribe an email address
   */
  async unsubscribeEmail(
    email: string,
    source: string = "user_request",
  ): Promise<void> {
    await this.suppressEmail({
      email,
      suppressionType: "unsubscribe",
      reason: `Unsubscribed via ${source}`,
      suppressedAt: new Date(),
      isPermanent: true,
    });
  }

  // Private helper methods

  private async logBounceEvent(bounceEvent: BounceEvent): Promise<void> {
    await this.tursoClient.execute({
      sql: `
        INSERT INTO email_events (email, event_type, bounce_type, bounce_sub_type, diagnostic_code, created_at)
        VALUES (?, 'bounce', ?, ?, ?, ?)
      `,
      args: [
        bounceEvent.email,
        bounceEvent.bounceType,
        bounceEvent.bounceSubType,
        bounceEvent.diagnosticCode || null,
        bounceEvent.timestamp.toISOString(),
      ],
    });
  }

  private async logComplaintEvent(
    complaintEvent: ComplaintEvent,
  ): Promise<void> {
    await this.tursoClient.execute({
      sql: `
        INSERT INTO email_events (email, event_type, complaint_type, user_agent, complaint_source, created_at)
        VALUES (?, 'complaint', ?, ?, ?, ?)
      `,
      args: [
        complaintEvent.email,
        complaintEvent.complaintType,
        complaintEvent.userAgent || null,
        complaintEvent.complaintSource || null,
        complaintEvent.timestamp.toISOString(),
      ],
    });
  }

  private async suppressEmail(
    suppression: EmailSuppressionRecord,
  ): Promise<void> {
    await this.tursoClient.execute({
      sql: `
        INSERT OR REPLACE INTO email_suppressions (email, suppression_type, reason, suppressed_at, is_permanent)
        VALUES (?, ?, ?, ?, ?)
      `,
      args: [
        suppression.email,
        suppression.suppressionType,
        suppression.reason,
        suppression.suppressedAt.toISOString(),
        suppression.isPermanent ? 1 : 0,
      ],
    });
  }

  private async shouldSuppressForBounce(
    bounceEvent: BounceEvent,
  ): Promise<boolean> {
    // Hard bounces always result in suppression
    if (bounceEvent.bounceType === "hard") {
      return true;
    }

    // For soft bounces, check if we've had multiple recent bounces
    const result = await this.tursoClient.execute({
      sql: `
        SELECT COUNT(*) as bounce_count
        FROM email_events
        WHERE email = ? AND event_type = 'bounce' AND created_at > datetime('now', '-7 days')
      `,
      args: [bounceEvent.email],
    });

    const bounceCount = Number(result.rows[0]?.bounce_count) || 0;
    return bounceCount >= 3; // Suppress after 3 soft bounces in a week
  }

  private async updateBounceMetrics(bounceEvent: BounceEvent): Promise<void> {
    // Update daily metrics for monitoring
    await this.tursoClient.execute({
      sql: `
        INSERT OR REPLACE INTO daily_email_metrics (date, bounce_count, hard_bounce_count)
        VALUES (
          date('now'),
          COALESCE((SELECT bounce_count FROM daily_email_metrics WHERE date = date('now')), 0) + 1,
          COALESCE((SELECT hard_bounce_count FROM daily_email_metrics WHERE date = date('now')), 0) + 
          CASE WHEN ? = 'hard' THEN 1 ELSE 0 END
        )
      `,
      args: [bounceEvent.bounceType],
    });
  }

  private async updateComplaintMetrics(
    complaintEvent: ComplaintEvent,
  ): Promise<void> {
    await this.tursoClient.execute({
      sql: `
        INSERT OR REPLACE INTO daily_email_metrics (date, complaint_count)
        VALUES (
          date('now'),
          COALESCE((SELECT complaint_count FROM daily_email_metrics WHERE date = date('now')), 0) + 1
        )
      `,
      args: [],
    });
  }

  private async checkComplaintRate(): Promise<void> {
    const stats = await this.getEmailReputationStats();

    // AWS recommends keeping complaint rate below 0.1%
    if (stats.complaintRate > 0.1) {
      console.warn(
        `HIGH COMPLAINT RATE ALERT: ${stats.complaintRate.toFixed(3)}% (should be < 0.1%)`,
      );
      // In production, you might want to:
      // - Send alerts to administrators
      // - Temporarily pause all marketing emails
      // - Review recent email campaigns
    }

    // AWS recommends keeping bounce rate below 5%
    if (stats.bounceRate > 5) {
      console.warn(
        `HIGH BOUNCE RATE ALERT: ${stats.bounceRate.toFixed(2)}% (should be < 5%)`,
      );
    }
  }
}
