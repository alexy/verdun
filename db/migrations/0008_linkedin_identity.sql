alter table verdun_account
    drop constraint if exists verdun_account_provider_check;

alter table verdun_account
    add constraint verdun_account_provider_check
    check (provider in ('google', 'linkedin', 'email'));

alter table verdun_account_identity
    drop constraint if exists verdun_account_identity_provider_check;

alter table verdun_account_identity
    add constraint verdun_account_identity_provider_check
    check (provider in ('google', 'linkedin', 'email'));

do $migration$
declare
    original_definition text;
    updated_definition text;
begin
    original_definition := pg_get_functiondef(
        'verdun_resolve_account_identity(text,text,text,text,text,boolean)'::regprocedure
    );
    updated_definition := replace(
        original_definition,
        'p_provider not in (''google'', ''email'')',
        'p_provider not in (''google'', ''linkedin'', ''email'')'
    );
    updated_definition := replace(
        updated_definition,
        'when p_provider = ''google'' and p_name is not null then p_name',
        'when p_provider in (''google'', ''linkedin'') and p_name is not null then p_name'
    );
    updated_definition := replace(
        updated_definition,
        'when p_provider = ''google'' and p_picture_url is not null then p_picture_url',
        'when p_provider in (''google'', ''linkedin'') and p_picture_url is not null then p_picture_url'
    );
    if updated_definition = original_definition
       or updated_definition not like '%linkedin%' then
        raise exception 'verdun_linkedin_identity_migration_function_shape_changed';
    end if;
    execute updated_definition;
end;
$migration$;
