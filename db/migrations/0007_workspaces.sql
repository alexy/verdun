-- Application-scoped workspaces are reusable account collaboration primitives.
create table if not exists verdun_workspace (
    id uuid primary key default gen_random_uuid(),
    application_key text not null,
    owner_account_id uuid not null references verdun_account(id) on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (application_key, owner_account_id)
);

create table if not exists verdun_workspace_member (
    workspace_id uuid not null references verdun_workspace(id) on delete cascade,
    account_id uuid not null references verdun_account(id) on delete cascade,
    role text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (workspace_id, account_id),
    check (length(btrim(role)) between 1 and 64)
);

create index if not exists verdun_workspace_member_account_idx on verdun_workspace_member(account_id, updated_at desc);

create table if not exists verdun_workspace_invitation (
    id uuid primary key default gen_random_uuid(),
    workspace_id uuid not null references verdun_workspace(id) on delete cascade,
    email text not null check (email = lower(btrim(email))),
    role text not null check (length(btrim(role)) between 1 and 64),
    created_by_account_id uuid not null references verdun_account(id) on delete restrict,
    expires_at timestamptz not null default (now() + interval '7 days'),
    accepted_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz not null default now(),
    unique (workspace_id, email)
);
