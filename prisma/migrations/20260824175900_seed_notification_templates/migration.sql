-- Data-only (no schema changes) — pre-seeds the fixed (event_type, channel)
-- slots the Phase 4 SLA engine and the MOM/Meeting event fan-outs render
-- through. Rows are admin-editable afterward via Settings → Notification
-- Templates (manage_notification_templates permission), but the set of
-- (event_type, channel) pairs itself is fixed by the unique constraint —
-- this seed is what makes every pair exist, not just a starting example.
--
-- Token reference (rendered via {{token}} substitution, unknown tokens
-- render blank):
--   ACTION_ITEM_DUE_SOON / ACTION_ITEM_OVERDUE / ACTION_ITEM_ESCALATED:
--     {{description}}, {{priority}}, {{dueDate}}, {{meetingTitle}}, {{actionUrl}}
--   MOM_PUBLISHED: {{meetingTitle}}, {{actionUrl}}
--   MEETING_CANCELLED / MEETING_RESCHEDULED: {{meetingTitle}}, {{scheduledAt}}, {{reason}}, {{actionUrl}}

INSERT INTO notification_templates (event_type, channel, subject, body, is_active, updated_at)
VALUES
  ('ACTION_ITEM_DUE_SOON', 'IN_APP', 'Action Item Due Soon',
    '"{{description}}" is due {{dueDate}} ({{priority}} priority).', true, CURRENT_TIMESTAMP),
  ('ACTION_ITEM_DUE_SOON', 'EMAIL', 'Action item due soon: {{description}}',
    '<p>This action item is due soon:</p><p><strong>{{description}}</strong><br/>Priority: {{priority}}<br/>Due: {{dueDate}}</p><p>From meeting: {{meetingTitle}}</p><p><a href="{{actionUrl}}">Open in MeghaSales</a></p>',
    true, CURRENT_TIMESTAMP),

  ('ACTION_ITEM_OVERDUE', 'IN_APP', 'Action Item Overdue',
    '"{{description}}" was due {{dueDate}} and is now overdue.', true, CURRENT_TIMESTAMP),
  ('ACTION_ITEM_OVERDUE', 'EMAIL', 'Overdue action item: {{description}}',
    '<p>This action item is now overdue:</p><p><strong>{{description}}</strong><br/>Priority: {{priority}}<br/>Was due: {{dueDate}}</p><p>From meeting: {{meetingTitle}}</p><p><a href="{{actionUrl}}">Open in MeghaSales</a></p>',
    true, CURRENT_TIMESTAMP),

  ('ACTION_ITEM_ESCALATED', 'IN_APP', 'Action Item Escalated To You',
    'Escalated: "{{description}}" (from meeting "{{meetingTitle}}") has been overdue since {{dueDate}} and needs your attention.', true, CURRENT_TIMESTAMP),
  ('ACTION_ITEM_ESCALATED', 'EMAIL', 'Escalated action item: {{description}}',
    '<p>This action item has been escalated to you because it remains overdue:</p><p><strong>{{description}}</strong><br/>Priority: {{priority}}<br/>Was due: {{dueDate}}</p><p>From meeting: {{meetingTitle}}</p><p><a href="{{actionUrl}}">Open in MeghaSales</a></p>',
    true, CURRENT_TIMESTAMP),

  ('MOM_PUBLISHED', 'IN_APP', 'Minutes of Meeting Published',
    'The Minutes of Meeting for "{{meetingTitle}}" have been published.', true, CURRENT_TIMESTAMP),
  ('MOM_PUBLISHED', 'EMAIL', 'MOM published: {{meetingTitle}}',
    '<p>The Minutes of Meeting for <strong>{{meetingTitle}}</strong> have been published.</p><p><a href="{{actionUrl}}">Open in MeghaSales</a></p>',
    true, CURRENT_TIMESTAMP),

  ('MEETING_CANCELLED', 'IN_APP', 'Meeting Cancelled',
    '"{{meetingTitle}}" scheduled for {{scheduledAt}} has been cancelled. {{reason}}', true, CURRENT_TIMESTAMP),
  ('MEETING_CANCELLED', 'EMAIL', 'Meeting cancelled: {{meetingTitle}}',
    '<p><strong>{{meetingTitle}}</strong>, scheduled for {{scheduledAt}}, has been cancelled.</p><p>{{reason}}</p><p><a href="{{actionUrl}}">Open in MeghaSales</a></p>',
    true, CURRENT_TIMESTAMP),

  ('MEETING_RESCHEDULED', 'IN_APP', 'Meeting Rescheduled',
    '"{{meetingTitle}}" has been rescheduled to {{scheduledAt}}. {{reason}}', true, CURRENT_TIMESTAMP),
  ('MEETING_RESCHEDULED', 'EMAIL', 'Meeting rescheduled: {{meetingTitle}}',
    '<p><strong>{{meetingTitle}}</strong> has been rescheduled to {{scheduledAt}}.</p><p>{{reason}}</p><p><a href="{{actionUrl}}">Open in MeghaSales</a></p>',
    true, CURRENT_TIMESTAMP)
ON CONFLICT (event_type, channel) DO NOTHING;
