-- Performance fix: the leads list's default (unfiltered) view sorts by
-- createdAt, the dashboard stats widget (always fetched on the leads page)
-- counts by status/leadSource/nextFollowUpDate on every page load, and the
-- on-demand deadline-reminder scan (piggybacked on every GET /api/leads)
-- filters Lead on nextFollowUpDate/assignedBaId and EventDiscussion on
-- completionStatus/targetDate/assignedToId. Both tables had zero indexes on
-- these columns, forcing a full table scan on every one of those queries —
-- this is what made the leads page slow to load. Additive only, no data or
-- application-behavior change.

CREATE INDEX "leads_created_at_idx" ON "leads"("created_at");
CREATE INDEX "leads_status_idx" ON "leads"("status");
CREATE INDEX "leads_lead_source_idx" ON "leads"("lead_source");
CREATE INDEX "leads_assigned_ba_id_idx" ON "leads"("assigned_ba_id");
CREATE INDEX "leads_next_follow_up_date_idx" ON "leads"("next_follow_up_date");
CREATE INDEX "leads_last_follow_up_date_idx" ON "leads"("last_follow_up_date");

CREATE INDEX "event_discussions_completion_status_idx" ON "event_discussions"("completion_status");
CREATE INDEX "event_discussions_target_date_idx" ON "event_discussions"("target_date");
CREATE INDEX "event_discussions_assigned_to_idx" ON "event_discussions"("assigned_to");
