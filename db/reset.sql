-- DANGER: drops every Lehar HR table and all data. Used by `npm run db:reset` (asks for confirmation).
drop table if exists local_logins, local_auth_secret, policy_documents, email_log, agent_drafts, agent_log, audit_log, leave_attachments, leave_requests,
  leave_balances, leave_types, regularisation_requests, attendance, holidays, employee_bank, employee_statutory, employees,
  departments, locations cascade;
drop sequence if exists employee_code_seq;
drop schema if exists app cascade;
drop table if exists schema_migrations;
