-- 003_local_logins.sql: email + password sign-in for the OFFLINE / local mode only (decision D-17).
-- Production uses Clerk; these tables stay empty there. Passwords are stored as scrypt hashes.
create table local_logins (
  employee_id    uuid primary key references employees(id),
  password_hash  text not null check (password_hash like 'scrypt$%'),
  updated_at     timestamptz not null default now()
);

-- One random secret used to sign the local session cookie (HMAC-SHA256)
create table local_auth_secret (
  id      boolean primary key default true check (id),
  secret  text not null default md5(random()::text || clock_timestamp()::text) || md5(random()::text || pg_backend_pid()::text)
);
insert into local_auth_secret default values;

alter table local_logins enable row level security;       -- no policies: server only
alter table local_auth_secret enable row level security;
revoke all on local_logins, local_auth_secret from anon, authenticated;
