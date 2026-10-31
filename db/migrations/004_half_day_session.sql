-- 004_half_day_session.sql: which half of the day a half-day leave covers (R-LV-19, decision D-20).
-- Older half-day requests keep NULL (shown as plain "Half day"); new ones must say FIRST or SECOND
-- (enforced in lib/core/leave-rules.ts so the form and the agent get a readable message).
alter table leave_requests
  add column half_day_session text check (half_day_session in ('FIRST','SECOND'));
alter table leave_requests
  add constraint leave_session_only_for_half_day check (half_day_session is null or is_half_day);

-- Keep the agent's policy text in step (only if HR has not already rewritten these lines)
update policy_documents set body = replace(body,
  '- Casual Leave can be taken as a half day.',
  '- Casual Leave can be taken as a half day. For a half day, choose the first half (morning) or the second half (afternoon).')
 where slug = 'leave-policy' and body not like '%first half (morning)%';
update policy_documents set body = replace(body,
  '- Checking in after 10:15 AM is marked Late.',
  '- Checking in after 10:15 AM is marked Late. It does not count as Late on a day when the first half (morning) is on approved half-day leave.')
 where slug = 'attendance-policy' and body not like '%first half (morning)%';
