begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(10);
insert into auth.users (id, email, raw_user_meta_data) values
('10000000-0000-0000-0000-000000000001', 'citizen-test@example.com', '{"full_name":"Cidadão Teste","account_type":"ADMIN","role":"ADMIN"}'),
('10000000-0000-0000-0000-000000000002', 'agent-test@example.com', '{"full_name":"Agente Teste","account_type":"PUBLIC_AGENT","organization_name":"Prefeitura Teste","government_level":"MUNICIPAL","public_position":"Fiscal"}');
select is((select role from profiles where id='10000000-0000-0000-0000-000000000001'), 'CITIZEN', 'metadados de cadastro não concedem ADMIN');
select is((select role from profiles where id='10000000-0000-0000-0000-000000000002'), 'PUBLIC_AGENT', 'cadastro público preserva papel');
select throws_ok($$insert into auth.users (id,email,raw_user_meta_data) values ('10000000-0000-0000-0000-000000000003','incomplete@example.com','{"full_name":"Agente Incompleto","account_type":"PUBLIC_AGENT"}')$$, '23514', null, 'órgão e cargo são obrigatórios no banco');
insert into public.incidents (id,user_id,category,title,description,latitude,longitude,status) values
('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','FLOOD','Alagamento de teste','Relato do cidadão',-23,-43,'PENDING');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select throws_ok($$select public.update_incident_status('20000000-0000-0000-0000-000000000001','RESOLVED')$$, 'P0001', 'Public service permission required', 'cidadão não atende ocorrência');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select lives_ok($$select public.update_incident_status('20000000-0000-0000-0000-000000000001','IN_PROGRESS')$$, 'agente atende ocorrência de outro usuário');
select is((select status from incidents where id='20000000-0000-0000-0000-000000000001'), 'IN_PROGRESS', 'status atualizado');
select is((select changed_by::text from incident_history where incident_id='20000000-0000-0000-0000-000000000001'), '10000000-0000-0000-0000-000000000002', 'histórico identifica agente autenticado');
select throws_ok($$select public.update_incident_status('20000000-0000-0000-0000-000000000001',null)$$, 'P0001', 'Invalid status', 'status nulo é rejeitado');
update incidents set title='Título indevido' where id='20000000-0000-0000-0000-000000000001';
select is((select title from incidents where id='20000000-0000-0000-0000-000000000001'), 'Alagamento de teste', 'agente não edita dados arbitrários via tabela');
do $$begin update profiles set role='ADMIN' where id=auth.uid(); exception when insufficient_privilege then null; end$$;
select is((select role from profiles where id=auth.uid()), 'PUBLIC_AGENT', 'agente não promove o próprio perfil');
reset role;
select * from finish();
rollback;
