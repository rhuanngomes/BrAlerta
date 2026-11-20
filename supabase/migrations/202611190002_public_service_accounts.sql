-- Public service accounts may manage incident status, but have no administrator role.
alter table public.profiles
  drop constraint if exists profiles_role_check,
  add constraint profiles_role_check check (role in ('CITIZEN', 'PUBLIC_AGENT', 'ADMIN')),
  add column organization_name text,
  add column government_level text check (government_level in ('MUNICIPAL', 'STATE', 'FEDERAL', 'OTHER')),
  add column public_position text,
  add constraint public_agent_details_required check (
    role <> 'PUBLIC_AGENT' or (
      organization_name is not null and char_length(trim(organization_name)) between 2 and 160
      and public_position is not null and char_length(trim(public_position)) between 2 and 120
      and government_level is not null
    )
  );

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  account_role text := case when new.raw_user_meta_data ->> 'account_type' = 'PUBLIC_AGENT' then 'PUBLIC_AGENT' else 'CITIZEN' end;
begin
  -- ADMIN can only be assigned by a trusted database operator, never signup metadata.
  insert into public.profiles (id, email, full_name, role, organization_name, government_level, public_position)
  values (
    new.id, coalesce(new.email, ''),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, 'Usuário'), '@', 1)),
    account_role,
    case when account_role = 'PUBLIC_AGENT' then trim(new.raw_user_meta_data ->> 'organization_name') end,
    case when account_role = 'PUBLIC_AGENT' then new.raw_user_meta_data ->> 'government_level' end,
    case when account_role = 'PUBLIC_AGENT' then trim(new.raw_user_meta_data ->> 'public_position') end
  ) on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.update_incident_status(p_incident_id uuid, p_new_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare old_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role in ('PUBLIC_AGENT', 'ADMIN')) then
    raise exception 'Public service permission required';
  end if;
  if p_new_status is null or p_new_status not in ('PENDING', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED') then
    raise exception 'Invalid status';
  end if;
  select status into old_status from public.incidents where id = p_incident_id for update;
  if not found then raise exception 'Incident not found'; end if;
  if old_status = p_new_status then return; end if;
  update public.incidents set status = p_new_status, updated_at = now() where id = p_incident_id;
  insert into public.incident_history (incident_id, previous_status, new_status, changed_by, event_type)
  values (p_incident_id, old_status, p_new_status, auth.uid(), case when p_new_status = 'CANCELLED' then 'CANCELLED' else 'STATUS_UPDATED' end);
end;
$$;
revoke all on function public.update_incident_status(uuid, text) from public, anon;
grant execute on function public.update_incident_status(uuid, text) to authenticated;
-- Keep existing RLS: public agents cannot edit titles, owners, coordinates or profiles directly.
