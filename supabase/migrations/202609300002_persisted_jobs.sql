alter table public.jobs
  add column store_id uuid references public.stores on delete cascade,
  add column audit_id uuid references public.audits on delete cascade,
  add column total_items integer not null default 0 check (total_items >= 0),
  add column completed_items integer not null default 0 check (completed_items >= 0),
  add column failed_items integer not null default 0 check (failed_items >= 0),
  add column locked_by uuid,
  add column locked_until timestamptz,
  add column updated_at timestamptz not null default now(),
  add column started_at timestamptz,
  add column finished_at timestamptz,
  add column payload jsonb not null default '{}';
alter table public.products add column vendor text not null default '';

create unique index stores_workspace_type_name_idx on public.stores(workspace_id, type, name);
create policy store_insert_demo_editor on public.stores for insert with check (
  type = 'demo' and exists (
    select 1 from public.workspace_members m
    where m.workspace_id = stores.workspace_id and m.user_id = auth.uid() and m.role in ('Owner','Editor')
  )
);
create unique index product_images_product_url_idx on public.product_images(product_id,url);
alter table public.audit_issues add column fingerprint text not null default '';
update public.audit_issues set fingerprint = id::text where fingerprint = '';
create unique index audit_issues_audit_fingerprint_idx on public.audit_issues(audit_id, fingerprint);

create table public.job_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  job_id uuid not null references public.jobs on delete cascade,
  item_key text not null,
  status text not null default 'pending' check (status in ('pending','succeeded','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  result jsonb not null default '{}',
  error jsonb,
  updated_at timestamptz not null default now(),
  unique (job_id, item_key)
);
create index job_items_workspace_job_status_idx on public.job_items(workspace_id, job_id, status);

alter table public.job_items enable row level security;
create policy job_items_select on public.job_items for select using (public.is_workspace_member(workspace_id));

drop policy if exists tenant_insert on public.jobs;
drop policy if exists tenant_update on public.jobs;
create policy jobs_insert_editor on public.jobs for insert with check (
  exists (select 1 from public.workspace_members m where m.workspace_id = jobs.workspace_id and m.user_id = auth.uid() and m.role in ('Owner','Editor'))
);

create or replace function public.claim_batch_job(target_job uuid, worker_token uuid, lease_seconds integer default 90)
returns setof public.jobs
language plpgsql security definer set search_path = public
as $$
declare
  current_job public.jobs%rowtype;
  actor_role public.member_role;
begin
  select * into current_job from public.jobs where id = target_job for update;
  if not found then return; end if;

  select role into actor_role from public.workspace_members
    where workspace_id = current_job.workspace_id and user_id = auth.uid();
  if actor_role is null or actor_role not in ('Owner','Editor') then raise exception 'Workspace editor access required'; end if;
  if current_job.status not in ('queued','running') then return; end if;
  if current_job.locked_until is not null and current_job.locked_until > now() then return; end if;

  update public.jobs set status = 'running', locked_by = worker_token,
    locked_until = now() + make_interval(secs => greatest(15, least(lease_seconds, 300))),
    started_at = coalesce(started_at, now()), updated_at = now(), error = null
    where id = target_job returning * into current_job;
  return next current_job;
end;
$$;

create or replace function public.checkpoint_batch_job(
  target_job uuid,
  worker_token uuid,
  next_cursor jsonb,
  next_progress jsonb,
  next_status text,
  item_results jsonb default '[]'
)
returns public.jobs
language plpgsql security definer set search_path = public
as $$
declare
  current_job public.jobs%rowtype;
  result_item jsonb;
  next_item_status text;
begin
  select * into current_job from public.jobs where id = target_job for update;
  if not found or current_job.locked_by is distinct from worker_token or current_job.locked_until < now() then
    raise exception 'Job lease lost';
  end if;
  if next_status not in ('queued','running','completed','failed') then raise exception 'Invalid job status'; end if;
  if jsonb_typeof(item_results) <> 'array' then raise exception 'Item results must be an array'; end if;

  for result_item in select value from jsonb_array_elements(item_results)
  loop
    next_item_status := result_item->>'status';
    if next_item_status not in ('succeeded','failed') or coalesce(result_item->>'item_key','') = '' then
      raise exception 'Invalid job item result';
    end if;
    insert into public.job_items(workspace_id,job_id,item_key,status,attempts,result,error,updated_at)
    values (current_job.workspace_id,target_job,result_item->>'item_key',next_item_status,1,
      coalesce(result_item->'result','{}'),result_item->'error',now())
    on conflict (job_id,item_key) do update set
      status = excluded.status,
      attempts = public.job_items.attempts + 1,
      result = excluded.result,
      error = excluded.error,
      updated_at = now();
  end loop;

  update public.jobs set cursor = next_cursor, progress = next_progress, status = next_status,
    completed_items = coalesce((next_progress->>'completed')::integer, completed_items),
    failed_items = coalesce((next_progress->>'failed')::integer, failed_items),
    locked_by = null, locked_until = null, updated_at = now(),
    finished_at = case when next_status in ('completed','failed') then now() else null end
    where id = target_job returning * into current_job;
  return current_job;
end;
$$;

revoke all on function public.claim_batch_job(uuid,uuid,integer) from public;
revoke all on function public.checkpoint_batch_job(uuid,uuid,jsonb,jsonb,text,jsonb) from public;
grant execute on function public.claim_batch_job(uuid,uuid,integer) to authenticated;
grant execute on function public.checkpoint_batch_job(uuid,uuid,jsonb,jsonb,text,jsonb) to authenticated;
grant insert on public.jobs to authenticated;
grant select on public.job_items to authenticated;
