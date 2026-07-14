-- Application-scoped plan, subscription, and transition state.
--
-- The legacy verdun_account.tier column intentionally remains unchanged. It is
-- a compatibility surface for existing consumers; new applications should use
-- the application/family records below so one account can hold independent
-- plans in multiple products and in multiple plan families.

create extension if not exists pgcrypto;

create table if not exists verdun_application (
    application_key text primary key
        check (application_key ~ '^[a-z][a-z0-9_-]{0,62}$'),
    display_name text not null
        check (length(btrim(display_name)) between 1 and 160),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists verdun_plan_family (
    application_key text not null references verdun_application(application_key) on delete cascade,
    family_key text not null
        check (family_key ~ '^[a-z][a-z0-9_-]{0,62}$'),
    display_name text not null
        check (length(btrim(display_name)) between 1 and 160),
    description text check (description is null or length(description) <= 2000),
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (application_key, family_key)
);

create table if not exists verdun_plan (
    application_key text not null,
    family_key text not null,
    plan_key text not null
        check (plan_key ~ '^[a-z][a-z0-9_-]{0,62}$'),
    display_name text not null
        check (length(btrim(display_name)) between 1 and 160),
    description text check (description is null or length(description) <= 2000),
    entitlements jsonb not null default '{}'::jsonb
        check (jsonb_typeof(entitlements) = 'object'),
    is_default boolean not null default false,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (application_key, family_key, plan_key),
    foreign key (application_key, family_key)
        references verdun_plan_family(application_key, family_key)
        on delete cascade
);

create unique index if not exists verdun_plan_one_default_idx
    on verdun_plan(application_key, family_key)
    where is_default;

create index if not exists verdun_plan_active_idx
    on verdun_plan(application_key, family_key, is_active, plan_key);

create table if not exists verdun_plan_price (
    id uuid primary key default gen_random_uuid(),
    application_key text not null,
    family_key text not null,
    plan_key text not null,
    provider text not null
        check (provider ~ '^[a-z][a-z0-9_-]{0,62}$'),
    provider_price_id text not null
        check (length(btrim(provider_price_id)) between 1 and 255),
    currency text not null
        check (currency ~ '^[A-Z]{3}$'),
    unit_amount_minor bigint not null check (unit_amount_minor >= 0),
    recurring_interval text not null
        check (recurring_interval in ('day', 'week', 'month', 'year')),
    recurring_interval_count integer not null default 1
        check (recurring_interval_count between 1 and 1000),
    is_active boolean not null default true,
    metadata jsonb not null default '{}'::jsonb
        check (jsonb_typeof(metadata) = 'object'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    foreign key (application_key, family_key, plan_key)
        references verdun_plan(application_key, family_key, plan_key)
        on delete cascade,
    unique (provider, provider_price_id),
    unique (application_key, family_key, plan_key, provider, provider_price_id)
);

create index if not exists verdun_plan_price_plan_idx
    on verdun_plan_price(application_key, family_key, plan_key, is_active);

create table if not exists verdun_billing_customer (
    application_key text not null references verdun_application(application_key) on delete cascade,
    account_id uuid not null references verdun_account(id) on delete cascade,
    provider text not null
        check (provider ~ '^[a-z][a-z0-9_-]{0,62}$'),
    provider_customer_id text not null
        check (length(btrim(provider_customer_id)) between 1 and 255),
    metadata jsonb not null default '{}'::jsonb
        check (jsonb_typeof(metadata) = 'object'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (application_key, account_id, provider),
    unique (application_key, provider, provider_customer_id),
    unique (application_key, account_id, provider, provider_customer_id)
);

create table if not exists verdun_subscription (
    id uuid primary key default gen_random_uuid(),
    application_key text not null,
    account_id uuid not null references verdun_account(id) on delete cascade,
    family_key text not null,
    plan_key text not null,
    source text not null check (source in ('manual', 'provider')),
    status text not null
        check (status in ('incomplete', 'trialing', 'active', 'past_due', 'paused', 'canceled', 'unpaid')),
    provider text,
    provider_customer_id text,
    provider_subscription_id text,
    provider_price_id text,
    current_period_start timestamptz,
    current_period_end timestamptz,
    trial_end timestamptz,
    cancel_at timestamptz,
    canceled_at timestamptz,
    last_provider_event_id text,
    last_provider_event_at timestamptz,
    metadata jsonb not null default '{}'::jsonb
        check (jsonb_typeof(metadata) = 'object'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (application_key, account_id, family_key),
    foreign key (application_key, family_key, plan_key)
        references verdun_plan(application_key, family_key, plan_key),
    foreign key (application_key, account_id, provider, provider_customer_id)
        references verdun_billing_customer(application_key, account_id, provider, provider_customer_id),
    check (
        (source = 'manual'
            and provider is null
            and provider_customer_id is null
            and provider_subscription_id is null
            and provider_price_id is null
            and last_provider_event_id is null
            and last_provider_event_at is null)
        or
        (source = 'provider'
            and provider is not null
            and provider_customer_id is not null
            and provider_subscription_id is not null
            and last_provider_event_id is not null
            and last_provider_event_at is not null)
    ),
    check (current_period_end is null or current_period_start is null or current_period_end >= current_period_start)
);

create unique index if not exists verdun_subscription_provider_id_idx
    on verdun_subscription(provider, provider_subscription_id)
    where provider is not null and provider_subscription_id is not null;

create index if not exists verdun_subscription_account_idx
    on verdun_subscription(account_id, application_key, family_key);

create table if not exists verdun_subscription_provider_event (
    provider text not null
        check (provider ~ '^[a-z][a-z0-9_-]{0,62}$'),
    provider_event_id text not null
        check (length(btrim(provider_event_id)) between 1 and 255),
    application_key text not null references verdun_application(application_key) on delete cascade,
    account_id uuid not null references verdun_account(id) on delete cascade,
    family_key text not null,
    provider_subscription_id text not null,
    event_created_at timestamptz not null,
    payload jsonb not null default '{}'::jsonb
        check (jsonb_typeof(payload) = 'object'),
    outcome text not null default 'processing'
        check (outcome in ('processing', 'applied', 'stale', 'failed')),
    received_at timestamptz not null default now(),
    processed_at timestamptz,
    error text check (error is null or length(error) <= 2000),
    primary key (provider, provider_event_id),
    foreign key (application_key, family_key)
        references verdun_plan_family(application_key, family_key)
);

create index if not exists verdun_subscription_provider_event_subscription_idx
    on verdun_subscription_provider_event(provider, provider_subscription_id, event_created_at desc);

create table if not exists verdun_plan_transition (
    id uuid primary key default gen_random_uuid(),
    subscription_id uuid references verdun_subscription(id) on delete set null,
    application_key text not null references verdun_application(application_key) on delete cascade,
    account_id uuid not null references verdun_account(id) on delete cascade,
    family_key text not null,
    from_plan_key text,
    to_plan_key text not null,
    from_status text,
    to_status text not null
        check (to_status in ('incomplete', 'trialing', 'active', 'past_due', 'paused', 'canceled', 'unpaid')),
    source text not null check (source in ('manual', 'provider')),
    actor_account_id uuid references verdun_account(id) on delete set null,
    reason text check (reason is null or length(reason) <= 500),
    provider text,
    provider_event_id text,
    metadata jsonb not null default '{}'::jsonb
        check (jsonb_typeof(metadata) = 'object'),
    confirmation_delivery_state text not null default 'pending'
        check (confirmation_delivery_state in ('pending', 'sending', 'sent', 'suppressed', 'failed')),
    confirmation_delivery_attempts integer not null default 0
        check (confirmation_delivery_attempts >= 0),
    confirmation_last_attempt_at timestamptz,
    confirmation_delivered_at timestamptz,
    confirmation_suppressed_at timestamptz,
    confirmation_delivery_error text
        check (confirmation_delivery_error is null or length(confirmation_delivery_error) <= 2000),
    created_at timestamptz not null default now(),
    foreign key (application_key, family_key, to_plan_key)
        references verdun_plan(application_key, family_key, plan_key),
    foreign key (application_key, family_key, from_plan_key)
        references verdun_plan(application_key, family_key, plan_key),
    foreign key (provider, provider_event_id)
        references verdun_subscription_provider_event(provider, provider_event_id),
    check (from_status is null or from_status in ('incomplete', 'trialing', 'active', 'past_due', 'paused', 'canceled', 'unpaid')),
    check (
        (source = 'manual' and provider is null and provider_event_id is null)
        or
        (source = 'provider' and provider is not null and provider_event_id is not null)
    )
);

create index if not exists verdun_plan_transition_account_idx
    on verdun_plan_transition(application_key, account_id, family_key, created_at desc);

create index if not exists verdun_plan_transition_delivery_idx
    on verdun_plan_transition(confirmation_delivery_state, created_at)
    where confirmation_delivery_state in ('pending', 'failed');
