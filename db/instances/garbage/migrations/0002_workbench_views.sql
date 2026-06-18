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
left join review_state s on s.instance = r.instance and s.record_id = r.id
union all
select
  'garbage'::text as instance,
  i.id,
  i.title,
  i.url,
  i.source,
  i.source_kind,
  i.published_at as observed_at,
  i.project as subject,
  i.topic,
  i.summary,
  i.tags,
  i.score,
  coalesce(v.vote, 0)::smallint as review,
  i.raw_json->'provenance' as provenance_json,
  jsonb_build_object(
    'project', i.project,
    'why_it_matters', i.why_it_matters
  ) as normalized_json,
  i.raw_json,
  i.updated_at
from newsletter_items i
left join newsletter_votes v on v.item_id = i.id
where not exists (select 1 from records r where r.instance = 'garbage');

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
from source_runs
union all
select
  'garbage'::text as instance,
  source,
  kind,
  status,
  item_count,
  message,
  project_counts as subject_counts,
  collected_at
from newsletter_source_runs
where not exists (select 1 from source_runs r where r.instance = 'garbage');

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
from collection_plans
union all
select
  'garbage'::text as instance,
  project as subject,
  topic,
  hacker_news_query as query,
  live_terms,
  dev_to_tags as tags,
  review_targets,
  focus_terms,
  updated_at
from newsletter_query_plans
where not exists (select 1 from collection_plans p where p.instance = 'garbage');

create or replace view workbench_review_state as
select
  instance,
  record_id,
  review,
  updated_at
from review_state
union all
select
  'garbage'::text as instance,
  item_id as record_id,
  vote as review,
  updated_at
from newsletter_votes
where not exists (select 1 from review_state s where s.instance = 'garbage');

create or replace view workbench_focuses as
select
  instance,
  id,
  text,
  scope,
  created_at
from focuses
union all
select
  'garbage'::text as instance,
  id::text,
  text,
  scope,
  created_at
from newsletter_focuses
where not exists (select 1 from focuses f where f.instance = 'garbage');
