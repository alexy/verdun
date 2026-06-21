create extension if not exists pgcrypto;

create table if not exists verdun_account (
    id uuid primary key default gen_random_uuid(),
    email text not null unique check (email = lower(email)),
    name text,
    picture_url text,
    provider text not null default 'google' check (provider = 'google'),
    provider_subject text not null,
    tier text not null default 'free' check (tier in ('free', 'buyer', 'pro', 'admin')),
    status text not null default 'active' check (status in ('active', 'suspended')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    last_login_at timestamptz,
    unique (provider, provider_subject)
);

create table if not exists verdun_account_session (
    token_hash text primary key,
    account_id uuid not null references verdun_account(id) on delete cascade,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null
);

create index if not exists verdun_account_session_account_idx on verdun_account_session(account_id);
create index if not exists verdun_account_session_expires_idx on verdun_account_session(expires_at);

create table if not exists verdun_account_usage (
    account_id uuid not null references verdun_account(id) on delete cascade,
    capability text not null,
    window_start date not null,
    used integer not null default 0 check (used >= 0),
    updated_at timestamptz not null default now(),
    primary key (account_id, capability, window_start)
);

create table if not exists verdun_account_usage_subject (
    account_id uuid not null,
    capability text not null,
    window_start date not null,
    subject_id text not null,
    created_at timestamptz not null default now(),
    primary key (account_id, capability, window_start, subject_id),
    foreign key (account_id, capability, window_start)
        references verdun_account_usage(account_id, capability, window_start)
        on delete cascade
);
