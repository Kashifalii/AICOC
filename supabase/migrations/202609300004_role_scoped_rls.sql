create or replace function public.has_workspace_role(
  target_workspace uuid,
  allowed_roles public.member_role[]
)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target_workspace
      and user_id = auth.uid()
      and role = any(allowed_roles)
  )
$$;

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_workspace_role(target_workspace, array['Owner','Editor','Reviewer','Viewer']::public.member_role[]) $$;

create or replace function public.is_workspace_owner(target_workspace uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_workspace_role(target_workspace, array['Owner']::public.member_role[]) $$;

create or replace function public.is_workspace_editor(target_workspace uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.has_workspace_role(target_workspace, array['Owner','Editor']::public.member_role[]) $$;

create or replace function public.enforce_tenant_relations()
returns trigger language plpgsql security definer set search_path = public
as $$
declare related_workspace uuid;
begin
  if tg_table_name = 'product_images' then
    select workspace_id into related_workspace from public.products where id = new.product_id;
    if related_workspace is distinct from new.workspace_id then raise exception 'Product image tenant mismatch'; end if;
  elsif tg_table_name = 'products' then
    select workspace_id into related_workspace from public.stores where id = new.store_id;
    if related_workspace is distinct from new.workspace_id then raise exception 'Product tenant mismatch'; end if;
  elsif tg_table_name = 'collections' then
    select workspace_id into related_workspace from public.stores where id = new.store_id;
    if related_workspace is distinct from new.workspace_id then raise exception 'Collection tenant mismatch'; end if;
  elsif tg_table_name = 'product_collections' then
    select workspace_id into related_workspace from public.products where id = new.product_id;
    if related_workspace is distinct from new.workspace_id then raise exception 'Product collection tenant mismatch'; end if;
    select workspace_id into related_workspace from public.collections where id = new.collection_id;
    if related_workspace is distinct from new.workspace_id then raise exception 'Product collection tenant mismatch'; end if;
  elsif tg_table_name = 'audits' then
    select workspace_id into related_workspace from public.stores where id = new.store_id;
    if related_workspace is distinct from new.workspace_id then raise exception 'Audit tenant mismatch'; end if;
  elsif tg_table_name = 'audit_issues' then
    select workspace_id into related_workspace from public.audits where id = new.audit_id;
    if related_workspace is distinct from new.workspace_id then raise exception 'Audit issue tenant mismatch'; end if;
    select workspace_id into related_workspace from public.products where id = new.product_id;
    if related_workspace is distinct from new.workspace_id then raise exception 'Audit issue tenant mismatch'; end if;
  elsif tg_table_name = 'suggestions' then
    select workspace_id into related_workspace from public.products where id = new.product_id;
    if related_workspace is distinct from new.workspace_id then raise exception 'Suggestion tenant mismatch'; end if;
    if new.issue_id is not null then
      select workspace_id into related_workspace from public.audit_issues where id = new.issue_id;
      if related_workspace is distinct from new.workspace_id then raise exception 'Suggestion tenant mismatch'; end if;
    end if;
  elsif tg_table_name = 'jobs' then
    if new.store_id is not null then
      select workspace_id into related_workspace from public.stores where id = new.store_id;
      if related_workspace is distinct from new.workspace_id then raise exception 'Job tenant mismatch'; end if;
    end if;
    if new.audit_id is not null then
      select workspace_id into related_workspace from public.audits where id = new.audit_id;
      if related_workspace is distinct from new.workspace_id then raise exception 'Job tenant mismatch'; end if;
    end if;
  elsif tg_table_name = 'job_items' then
    select workspace_id into related_workspace from public.jobs where id = new.job_id;
    if related_workspace is distinct from new.workspace_id then raise exception 'Job item tenant mismatch'; end if;
  elsif tg_table_name = 'publish_batches' then
    select workspace_id into related_workspace from public.stores where id = new.store_id;
    if related_workspace is distinct from new.workspace_id then raise exception 'Publish batch tenant mismatch'; end if;
  elsif tg_table_name = 'publish_items' then
    select workspace_id into related_workspace from public.publish_batches where id = new.batch_id;
    if related_workspace is distinct from new.workspace_id then raise exception 'Publish item tenant mismatch'; end if;
    select workspace_id into related_workspace from public.suggestions where id = new.suggestion_id;
    if related_workspace is distinct from new.workspace_id then raise exception 'Publish item tenant mismatch'; end if;
  end if;
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'workspaces','workspace_members','stores','products','product_images','collections','product_collections',
    'brand_voices','audits','audit_issues','suggestions','jobs','job_items','ai_cache',
    'plan_limits','usage_events','publish_batches','publish_items','activity_log'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
  foreach table_name in array array[
    'products','product_images','collections','product_collections','audits','audit_issues',
    'suggestions','jobs','job_items','ai_cache','usage_events','publish_items','activity_log'
  ] loop
    execute format('drop policy if exists tenant_select on public.%I', table_name);
    execute format('drop policy if exists tenant_insert on public.%I', table_name);
    execute format('drop policy if exists tenant_update on public.%I', table_name);
    execute format('drop policy if exists tenant_delete on public.%I', table_name);
  end loop;
end $$;

drop policy if exists members_select on public.workspace_members;
drop policy if exists members_insert on public.workspace_members;
drop policy if exists members_update on public.workspace_members;
drop policy if exists members_delete on public.workspace_members;
create policy members_select on public.workspace_members for select using (user_id = auth.uid() or public.is_workspace_member(workspace_id));
create policy members_insert on public.workspace_members for insert with check (public.is_workspace_owner(workspace_id));
create policy members_update on public.workspace_members for update using (public.is_workspace_owner(workspace_id)) with check (public.is_workspace_owner(workspace_id));
create policy members_delete on public.workspace_members for delete using (public.is_workspace_owner(workspace_id));

drop policy if exists stores_select on public.stores;
drop policy if exists stores_insert_owner on public.stores;
drop policy if exists store_insert_demo_editor on public.stores;
drop policy if exists stores_update_owner on public.stores;
drop policy if exists stores_delete_owner on public.stores;
create policy stores_select on public.stores for select using (public.is_workspace_member(workspace_id));
create policy stores_insert_owner on public.stores for insert with check (public.is_workspace_owner(workspace_id));
create policy store_insert_demo_editor on public.stores for insert with check (type = 'demo' and public.is_workspace_editor(workspace_id));
create policy stores_update_owner on public.stores for update using (public.is_workspace_owner(workspace_id)) with check (public.is_workspace_owner(workspace_id));
create policy stores_delete_owner on public.stores for delete using (public.is_workspace_owner(workspace_id));

drop policy if exists tenant_select on public.workspaces;
drop policy if exists tenant_update on public.workspaces;
create policy workspace_select on public.workspaces for select using (public.is_workspace_member(id));
create policy workspace_update_owner on public.workspaces for update using (public.is_workspace_owner(id)) with check (public.is_workspace_owner(id));

drop policy if exists limits_select on public.plan_limits;
create policy limits_select on public.plan_limits for select using (public.is_workspace_member(workspace_id));

drop policy if exists brand_voice_select on public.brand_voices;
drop policy if exists brand_voice_insert_owner on public.brand_voices;
drop policy if exists brand_voice_update_owner on public.brand_voices;
create policy brand_voice_select on public.brand_voices for select using (public.is_workspace_member(workspace_id));
create policy brand_voice_insert_owner on public.brand_voices for insert with check (public.is_workspace_owner(workspace_id));
create policy brand_voice_update_owner on public.brand_voices for update using (public.is_workspace_owner(workspace_id)) with check (public.is_workspace_owner(workspace_id));

create policy products_select on public.products for select using (public.is_workspace_member(workspace_id));
create policy products_insert_editor on public.products for insert with check (public.is_workspace_editor(workspace_id));
create policy products_update_editor on public.products for update using (public.is_workspace_editor(workspace_id)) with check (public.is_workspace_editor(workspace_id));
create policy products_delete_editor on public.products for delete using (public.is_workspace_editor(workspace_id));

create policy product_images_select on public.product_images for select using (public.is_workspace_member(workspace_id));
create policy product_images_insert_editor on public.product_images for insert with check (public.is_workspace_editor(workspace_id));
create policy product_images_update_editor on public.product_images for update using (public.is_workspace_editor(workspace_id)) with check (public.is_workspace_editor(workspace_id));
create policy product_images_delete_editor on public.product_images for delete using (public.is_workspace_editor(workspace_id));

create policy collections_select on public.collections for select using (public.is_workspace_member(workspace_id));
create policy collections_insert_editor on public.collections for insert with check (public.is_workspace_editor(workspace_id));
create policy collections_update_editor on public.collections for update using (public.is_workspace_editor(workspace_id)) with check (public.is_workspace_editor(workspace_id));
create policy collections_delete_editor on public.collections for delete using (public.is_workspace_editor(workspace_id));

create policy product_collections_select on public.product_collections for select using (public.is_workspace_member(workspace_id));
create policy product_collections_insert_editor on public.product_collections for insert with check (public.is_workspace_editor(workspace_id));
create policy product_collections_delete_editor on public.product_collections for delete using (public.is_workspace_editor(workspace_id));

create policy audits_select on public.audits for select using (public.is_workspace_member(workspace_id));
create policy audits_insert_editor on public.audits for insert with check (public.is_workspace_editor(workspace_id));
create policy audits_update_editor on public.audits for update using (public.is_workspace_editor(workspace_id)) with check (public.is_workspace_editor(workspace_id));
create policy audits_delete_owner on public.audits for delete using (public.is_workspace_owner(workspace_id));

create policy audit_issues_select on public.audit_issues for select using (public.is_workspace_member(workspace_id));
create policy audit_issues_insert_editor on public.audit_issues for insert with check (public.is_workspace_editor(workspace_id));
create policy audit_issues_delete_editor on public.audit_issues for delete using (public.is_workspace_editor(workspace_id));

drop policy if exists suggestions_start_as_draft on public.suggestions;
create policy suggestions_select on public.suggestions for select using (public.is_workspace_member(workspace_id));
create policy suggestions_insert_editor on public.suggestions for insert with check (public.is_workspace_editor(workspace_id));

create policy jobs_select on public.jobs for select using (public.is_workspace_member(workspace_id));
drop policy if exists jobs_insert_editor on public.jobs;
create policy jobs_insert_editor on public.jobs for insert with check (public.is_workspace_editor(workspace_id));
create policy jobs_delete_owner on public.jobs for delete using (public.is_workspace_owner(workspace_id));
drop policy if exists job_items_select on public.job_items;
create policy job_items_select on public.job_items for select using (public.is_workspace_member(workspace_id));

create policy ai_cache_select on public.ai_cache for select using (public.is_workspace_member(workspace_id));
create policy ai_cache_insert_editor on public.ai_cache for insert with check (public.is_workspace_editor(workspace_id));
create policy ai_cache_update_editor on public.ai_cache for update using (public.is_workspace_editor(workspace_id)) with check (public.is_workspace_editor(workspace_id));
create policy ai_cache_delete_editor on public.ai_cache for delete using (public.is_workspace_editor(workspace_id));

create policy usage_events_select on public.usage_events for select using (public.is_workspace_member(workspace_id));

drop policy if exists publish_batches_select on public.publish_batches;
drop policy if exists publish_batches_insert_owner on public.publish_batches;
drop policy if exists publish_batches_update_owner on public.publish_batches;
drop policy if exists publish_batches_delete_owner on public.publish_batches;
create policy publish_batches_select on public.publish_batches for select using (public.is_workspace_member(workspace_id));
create policy publish_batches_insert_owner on public.publish_batches for insert with check (public.is_workspace_owner(workspace_id));
create policy publish_batches_update_owner on public.publish_batches for update using (public.is_workspace_owner(workspace_id)) with check (public.is_workspace_owner(workspace_id));
create policy publish_batches_delete_owner on public.publish_batches for delete using (public.is_workspace_owner(workspace_id));

create policy publish_items_select on public.publish_items for select using (public.is_workspace_member(workspace_id));
create policy activity_log_select on public.activity_log for select using (public.is_workspace_member(workspace_id));

create trigger tenant_products before insert or update on public.products for each row execute function public.enforce_tenant_relations();
create trigger tenant_product_images before insert or update on public.product_images for each row execute function public.enforce_tenant_relations();
create trigger tenant_collections before insert or update on public.collections for each row execute function public.enforce_tenant_relations();
create trigger tenant_product_collections before insert or update on public.product_collections for each row execute function public.enforce_tenant_relations();
create trigger tenant_audits before insert or update on public.audits for each row execute function public.enforce_tenant_relations();
create trigger tenant_audit_issues before insert or update on public.audit_issues for each row execute function public.enforce_tenant_relations();
create trigger tenant_suggestions before insert or update on public.suggestions for each row execute function public.enforce_tenant_relations();
create trigger tenant_jobs before insert or update on public.jobs for each row execute function public.enforce_tenant_relations();
create trigger tenant_job_items before insert or update on public.job_items for each row execute function public.enforce_tenant_relations();
create trigger tenant_publish_batches before insert or update on public.publish_batches for each row execute function public.enforce_tenant_relations();
create trigger tenant_publish_items before insert or update on public.publish_items for each row execute function public.enforce_tenant_relations();

revoke all on function public.has_workspace_role(uuid,public.member_role[]) from public,anon;
revoke all on function public.is_workspace_member(uuid) from public,anon;
revoke all on function public.is_workspace_owner(uuid) from public,anon;
revoke all on function public.is_workspace_editor(uuid) from public,anon;
revoke all on function public.enforce_tenant_relations() from public,anon,authenticated;
grant execute on function public.has_workspace_role(uuid,public.member_role[]) to authenticated,service_role;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_owner(uuid) to authenticated;
grant execute on function public.is_workspace_editor(uuid) to authenticated;
grant insert,update,delete on public.products,public.product_images,public.collections,public.product_collections to authenticated;
grant insert,update,delete on public.audits,public.audit_issues to authenticated;
grant select,insert on public.suggestions to authenticated;
grant select,insert,delete on public.jobs to authenticated;
grant select on public.job_items,public.ai_cache,public.usage_events,public.publish_items,public.activity_log to authenticated;
grant insert,update,delete on public.ai_cache to authenticated;
grant select on public.publish_batches to authenticated;
