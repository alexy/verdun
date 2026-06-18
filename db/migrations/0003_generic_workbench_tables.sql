create table if not exists instances (
  id text primary key,
  name text not null,
  base_path text not null,
  theme text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists records (
  id text not null,
  instance text not null references instances(id) on delete cascade,
  title text not null,
  url text not null,
  source text not null,
  source_kind text not null,
  observed_at timestamptz not null,
  subject text not null,
  topic text not null,
  summary text not null,
  tags text[] not null default '{}',
  score integer not null default 0,
  status text not null default 'active',
  dedupe_key text not null,
  provenance_json jsonb not null default '{}'::jsonb,
  normalized_json jsonb not null default '{}'::jsonb,
  raw_json jsonb not null default '{}'::jsonb,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (instance, id)
);

create table if not exists source_runs (
  instance text not null references instances(id) on delete cascade,
  source text not null,
  kind text not null,
  status text not null check (status in ('ok', 'error', 'pending', 'skipped')),
  item_count integer not null default 0,
  message text not null default '',
  subject_counts jsonb not null default '{}'::jsonb,
  collected_at timestamptz not null default now(),
  primary key (instance, source)
);

create table if not exists collection_plans (
  instance text not null references instances(id) on delete cascade,
  subject text not null,
  topic text not null,
  query text not null,
  live_terms text[] not null default '{}',
  tags text[] not null default '{}',
  review_targets jsonb not null default '[]'::jsonb,
  focus_terms text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (instance, subject)
);

create table if not exists review_state (
  instance text not null references instances(id) on delete cascade,
  record_id text not null,
  review smallint not null check (review in (-1, 0, 1)),
  updated_at timestamptz not null default now(),
  primary key (instance, record_id),
  foreign key (instance, record_id) references records(instance, id) on delete cascade
);

create table if not exists focuses (
  instance text not null references instances(id) on delete cascade,
  id text not null,
  text text not null,
  scope text not null check (scope in ('this_week', 'ongoing')),
  created_at timestamptz not null default now(),
  primary key (instance, id)
);

create index if not exists records_instance_rank_idx on records (instance, observed_at desc, score desc);
create index if not exists records_instance_subject_idx on records (instance, subject);
create index if not exists records_instance_topic_idx on records (instance, topic);
create index if not exists records_instance_dedupe_idx on records (instance, dedupe_key);
create index if not exists source_runs_instance_status_idx on source_runs (instance, status, collected_at desc);
create index if not exists collection_plans_instance_topic_idx on collection_plans (instance, topic);

create or replace view workbench_records as
select
  r.instance,
  r.id,
  r.title,
  r.url,
  r.source,
  r.source_kind,
  r.observed_at,
  r.subject,
  r.topic,
  r.summary,
  r.tags,
  r.score,
  coalesce(s.review, 0)::smallint as review,
  r.provenance_json,
  r.normalized_json,
  r.raw_json,
  r.updated_at
from records r
left join review_state s on s.instance = r.instance and s.record_id = r.id;

create or replace view workbench_source_runs as
select
  instance,
  source,
  kind,
  status,
  item_count,
  message,
  subject_counts,
  collected_at
from source_runs;

create or replace view workbench_collection_plans as
select
  instance,
  subject,
  topic,
  query,
  live_terms,
  tags,
  review_targets,
  focus_terms,
  updated_at
from collection_plans;

create or replace view workbench_review_state as
select
  instance,
  record_id,
  review,
  updated_at
from review_state;

create or replace view workbench_focuses as
select
  instance,
  id,
  text,
  scope,
  created_at
from focuses;
