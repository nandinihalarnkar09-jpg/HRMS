-- 005_backdated_leave.sql: back-dated leave is allowed anywhere in the current leave year (R-LV-09 revised, D-22).
-- The rule itself lives in lib/core/leave-rules.ts; this keeps the agent's policy text in step
-- (only if HR has not already rewritten that line).
update policy_documents set body = replace(body,
  '- Leave cannot be applied for more than 30 days in the past.',
  '- You can apply for past dates (back-dated leave) anywhere in the current leave year, from 1 January. For example, sick days can be applied for when you return. It still needs your manager''s approval, and once approved the day changes from Absent to On Leave.')
 where slug = 'leave-policy';
