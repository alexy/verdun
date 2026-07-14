alter table verdun_account
    drop constraint if exists verdun_account_provider_check;

alter table verdun_account
    add constraint verdun_account_provider_check
    check (provider in ('google', 'email'));

create table if not exists verdun_account_identity (
    id uuid primary key default gen_random_uuid(),
    account_id uuid not null references verdun_account(id) on delete cascade,
    provider text not null check (provider in ('google', 'email')),
    provider_subject text not null,
    verified_email text not null check (verified_email = lower(btrim(verified_email))),
    verified_at timestamptz not null default now(),
    password_hash text,
    password_updated_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    last_used_at timestamptz,
    unique (provider, provider_subject),
    unique (account_id, provider),
    check (provider = 'email' or password_hash is null),
    check (provider <> 'email' or provider_subject = verified_email)
);

create index if not exists verdun_account_identity_account_idx
    on verdun_account_identity(account_id);

insert into verdun_account_identity (
    account_id,
    provider,
    provider_subject,
    verified_email,
    verified_at,
    last_used_at
)
select
    id,
    'google',
    provider_subject,
    email,
    coalesce(last_login_at, created_at),
    last_login_at
from verdun_account
where provider = 'google'
on conflict (provider, provider_subject) do nothing;

create table if not exists verdun_auth_challenge (
    id uuid primary key,
    purpose text not null check (purpose in ('verify_email', 'passwordless_login', 'password_reset')),
    email text not null check (email = lower(btrim(email))),
    account_id uuid references verdun_account(id) on delete cascade,
    token_hash text not null unique,
    code_hash text not null,
    pending_password_hash text,
    attempts integer not null default 0 check (attempts >= 0),
    max_attempts integer not null default 5 check (max_attempts between 1 and 10),
    delivery_state text not null default 'pending'
        check (delivery_state in ('pending', 'sent', 'suppressed', 'failed')),
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    sent_at timestamptz,
    consumed_at timestamptz,
    superseded_at timestamptz,
    check (purpose = 'verify_email' or pending_password_hash is null)
);

create index if not exists verdun_auth_challenge_email_idx
    on verdun_auth_challenge(email, purpose, created_at desc);

create index if not exists verdun_auth_challenge_expiry_idx
    on verdun_auth_challenge(expires_at);

create unique index if not exists verdun_auth_challenge_one_active_idx
    on verdun_auth_challenge(email, purpose)
    where consumed_at is null and superseded_at is null;

create table if not exists verdun_auth_rate_bucket (
    scope text not null,
    key_hash text not null,
    bucket_start timestamptz not null,
    attempts integer not null check (attempts >= 0),
    expires_at timestamptz not null,
    primary key (scope, key_hash, bucket_start)
);

create index if not exists verdun_auth_rate_bucket_expiry_idx
    on verdun_auth_rate_bucket(expires_at);

create or replace function verdun_issue_email_challenge(
    p_id uuid,
    p_purpose text,
    p_email text,
    p_token_hash text,
    p_code_hash text,
    p_pending_password_hash text,
    p_max_attempts integer,
    p_lifetime_seconds integer
)
returns table (
    id uuid,
    purpose text,
    email text,
    created_at timestamptz,
    expires_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_account_id uuid;
    v_account_status text;
    v_has_email_password boolean := false;
    v_challenge verdun_auth_challenge;
begin
    if p_purpose not in ('verify_email', 'passwordless_login', 'password_reset')
       or p_email is null
       or p_email <> lower(btrim(p_email))
       or p_max_attempts not between 1 and 10
       or p_lifetime_seconds <= 0 then
        raise exception 'verdun_email_challenge_input_invalid' using errcode = '22023';
    end if;
    if p_purpose = 'verify_email' and p_pending_password_hash is null then
        raise exception 'verdun_email_challenge_password_missing' using errcode = '22023';
    end if;
    if p_purpose <> 'verify_email' and p_pending_password_hash is not null then
        raise exception 'verdun_email_challenge_password_unexpected' using errcode = '22023';
    end if;

    perform pg_advisory_xact_lock(hashtextextended('verdun:email:' || p_email, 0));

    select
        account.id,
        account.status,
        exists (
            select 1
            from verdun_account_identity identity
            where identity.account_id = account.id
              and identity.provider = 'email'
              and identity.password_hash is not null
        )
    into v_account_id, v_account_status, v_has_email_password
    from verdun_account account
    where account.email = p_email
    for update;

    if v_account_id is not null and v_account_status <> 'active' then
        return;
    end if;
    if p_purpose <> 'verify_email' and v_account_id is null then
        return;
    end if;
    if p_purpose = 'verify_email' and v_has_email_password then
        return;
    end if;

    update verdun_auth_challenge
    set superseded_at = now()
    where verdun_auth_challenge.email = p_email
      and verdun_auth_challenge.purpose = p_purpose
      and consumed_at is null
      and superseded_at is null;

    insert into verdun_auth_challenge (
        id,
        purpose,
        email,
        account_id,
        token_hash,
        code_hash,
        pending_password_hash,
        max_attempts,
        expires_at
    ) values (
        p_id,
        p_purpose,
        p_email,
        v_account_id,
        p_token_hash,
        p_code_hash,
        p_pending_password_hash,
        p_max_attempts,
        now() + (p_lifetime_seconds::text || ' seconds')::interval
    ) returning * into v_challenge;

    return query select
        v_challenge.id,
        v_challenge.purpose,
        v_challenge.email,
        v_challenge.created_at,
        v_challenge.expires_at;
end;
$$;

create or replace function verdun_resolve_account_identity(
    p_provider text,
    p_provider_subject text,
    p_verified_email text,
    p_name text default null,
    p_picture_url text default null,
    p_is_admin boolean default false
)
returns verdun_account
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_identity_account_id uuid;
    v_identity_email text;
    v_email_account_id uuid;
    v_account_id uuid;
    v_account verdun_account;
begin
    if p_provider not in ('google', 'email') then
        raise exception 'verdun_identity_provider_invalid' using errcode = '22023';
    end if;
    if p_provider_subject is null or btrim(p_provider_subject) = '' then
        raise exception 'verdun_identity_subject_invalid' using errcode = '22023';
    end if;
    if p_verified_email is null
       or btrim(p_verified_email) = ''
       or p_verified_email <> lower(btrim(p_verified_email)) then
        raise exception 'verdun_identity_email_invalid' using errcode = '22023';
    end if;
    if p_provider = 'email' and p_provider_subject <> p_verified_email then
        raise exception 'verdun_identity_email_subject_mismatch' using errcode = '22023';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(
        'verdun:email:' || p_verified_email,
        0
    ));
    perform pg_advisory_xact_lock(hashtextextended(
        'verdun:identity:' || p_provider || ':' || p_provider_subject,
        0
    ));

    select i.account_id, a.email
    into v_identity_account_id, v_identity_email
    from verdun_account_identity i
    join verdun_account a on a.id = i.account_id
    where i.provider = p_provider
      and i.provider_subject = p_provider_subject
    for update of i, a;

    select id
    into v_email_account_id
    from verdun_account
    where email = p_verified_email
    for update;

    if v_identity_account_id is not null and v_identity_email <> p_verified_email then
        raise exception 'verdun_identity_conflict' using errcode = 'P0001';
    end if;
    if v_identity_account_id is not null
       and v_email_account_id is not null
       and v_identity_account_id <> v_email_account_id then
        raise exception 'verdun_identity_conflict' using errcode = 'P0001';
    end if;

    if v_identity_account_id is not null then
        v_account_id := v_identity_account_id;
    elsif v_email_account_id is not null then
        if exists (
            select 1
            from verdun_account_identity
            where account_id = v_email_account_id
              and provider = p_provider
              and provider_subject <> p_provider_subject
        ) then
            raise exception 'verdun_identity_conflict' using errcode = 'P0001';
        end if;
        v_account_id := v_email_account_id;
        insert into verdun_account_identity (
            account_id,
            provider,
            provider_subject,
            verified_email,
            verified_at,
            last_used_at
        ) values (
            v_account_id,
            p_provider,
            p_provider_subject,
            p_verified_email,
            now(),
            now()
        );
    else
        insert into verdun_account (
            email,
            name,
            picture_url,
            provider,
            provider_subject,
            tier
        ) values (
            p_verified_email,
            p_name,
            p_picture_url,
            p_provider,
            p_provider_subject,
            case when p_is_admin then 'admin' else 'free' end
        ) returning id into v_account_id;

        insert into verdun_account_identity (
            account_id,
            provider,
            provider_subject,
            verified_email,
            verified_at,
            last_used_at
        ) values (
            v_account_id,
            p_provider,
            p_provider_subject,
            p_verified_email,
            now(),
            now()
        );
    end if;

    update verdun_account
    set
        name = case
            when p_provider = 'google' and p_name is not null then p_name
            else name
        end,
        picture_url = case
            when p_provider = 'google' and p_picture_url is not null then p_picture_url
            else picture_url
        end,
        tier = case when p_is_admin then 'admin' else tier end,
        updated_at = now()
    where id = v_account_id
    returning * into v_account;

    update verdun_account_identity
    set
        verified_email = p_verified_email,
        updated_at = now(),
        last_used_at = now()
    where provider = p_provider
      and provider_subject = p_provider_subject
      and account_id = v_account_id;

    return v_account;
exception
    when unique_violation then
        raise exception 'verdun_identity_conflict' using errcode = 'P0001';
end;
$$;

create or replace function verdun_complete_email_challenge(
    p_challenge_id uuid,
    p_purpose text,
    p_proof_kind text,
    p_proof_hash text,
    p_admin_emails text[],
    p_new_password_hash text,
    p_session_token_hash text,
    p_session_lifetime_seconds integer
)
returns table (
    proof_valid boolean,
    challenge_attempts integer,
    account_row jsonb
)
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_challenge verdun_auth_challenge;
    v_account verdun_account;
    v_account_status text;
    v_challenge_email text;
    v_proof_valid boolean;
    v_password_hash text;
begin
    if p_purpose not in ('verify_email', 'passwordless_login', 'password_reset')
       or p_proof_kind not in ('link', 'code')
       or p_session_lifetime_seconds <= 0 then
        raise exception 'verdun_email_challenge_input_invalid' using errcode = '22023';
    end if;

    select challenge.email
    into v_challenge_email
    from verdun_auth_challenge challenge
    where challenge.id = p_challenge_id
      and challenge.purpose = p_purpose;
    if not found then
        return query select false, 0, null::jsonb;
        return;
    end if;

    perform pg_advisory_xact_lock(hashtextextended('verdun:email:' || v_challenge_email, 0));

    select *
    into v_challenge
    from verdun_auth_challenge challenge
    where challenge.id = p_challenge_id
      and challenge.purpose = p_purpose
      and challenge.consumed_at is null
      and challenge.superseded_at is null
      and challenge.expires_at > now()
      and challenge.attempts < challenge.max_attempts
    for update;

    if not found then
        return query select false, 0, null::jsonb;
        return;
    end if;

    if v_challenge.account_id is not null then
        select status
        into v_account_status
        from verdun_account
        where id = v_challenge.account_id
        for update;
        if not found or v_account_status <> 'active' then
            return query select false, v_challenge.attempts, null::jsonb;
            return;
        end if;
    elsif v_challenge.purpose <> 'verify_email' then
        return query select false, v_challenge.attempts, null::jsonb;
        return;
    end if;

    v_proof_valid := case
        when p_proof_kind = 'link' then v_challenge.token_hash = p_proof_hash
        else v_challenge.code_hash = p_proof_hash
    end;

    if not v_proof_valid then
        update verdun_auth_challenge
        set attempts = attempts + 1
        where id = v_challenge.id
        returning attempts into v_challenge.attempts;
        return query select false, v_challenge.attempts, null::jsonb;
        return;
    end if;

    if v_challenge.purpose = 'password_reset' and p_new_password_hash is null then
        return query select true, v_challenge.attempts, null::jsonb;
        return;
    end if;

    update verdun_auth_challenge
    set consumed_at = now()
    where id = v_challenge.id;

    v_account := verdun_resolve_account_identity(
        'email',
        v_challenge.email,
        v_challenge.email,
        null,
        null,
        v_challenge.email = any(p_admin_emails)
    );

    if v_challenge.account_id is not null and v_challenge.account_id <> v_account.id then
        raise exception 'verdun_identity_conflict' using errcode = 'P0001';
    end if;

    v_password_hash := case
        when v_challenge.purpose = 'verify_email' then v_challenge.pending_password_hash
        when v_challenge.purpose = 'password_reset' then p_new_password_hash
        else null
    end;
    if v_challenge.purpose in ('verify_email', 'password_reset')
       and (v_password_hash is null or v_password_hash = '') then
        raise exception 'verdun_email_challenge_password_missing' using errcode = '22023';
    end if;

    update verdun_account_identity
    set
        password_hash = case
            when v_challenge.purpose in ('verify_email', 'password_reset') then v_password_hash
            else password_hash
        end,
        password_updated_at = case
            when v_challenge.purpose in ('verify_email', 'password_reset') then now()
            else password_updated_at
        end,
        updated_at = now(),
        last_used_at = now()
    where account_id = v_account.id
      and provider = 'email';
    if not found then
        raise exception 'verdun_email_identity_missing' using errcode = 'P0001';
    end if;

    if v_challenge.purpose = 'password_reset' then
        delete from verdun_account_session
        where account_id = v_account.id;
    end if;

    update verdun_auth_challenge
    set superseded_at = now()
    where email = v_challenge.email
      and id <> v_challenge.id
      and consumed_at is null
      and superseded_at is null
      and (
        purpose = v_challenge.purpose
        or v_challenge.purpose = 'password_reset'
      );

    insert into verdun_account_session (token_hash, account_id, expires_at)
    values (
        p_session_token_hash,
        v_account.id,
        now() + (p_session_lifetime_seconds::text || ' seconds')::interval
    );

    update verdun_account
    set last_login_at = now(), updated_at = now()
    where id = v_account.id
      and status = 'active'
    returning * into v_account;
    if not found then
        raise exception 'suspended_account' using errcode = 'P0001';
    end if;

    return query select true, v_challenge.attempts, to_jsonb(v_account);
end;
$$;
