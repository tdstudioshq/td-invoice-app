begin;
do $$ begin
 if has_function_privilege('anon','public.log_partner_job_event(uuid,text,jsonb,text,text,text)','execute') then raise exception 'anon can log partner events'; end if;
 if has_function_privilege('anon','public.assert_not_portal_user()','execute') then raise exception 'trigger exposed'; end if;
 if not has_function_privilege('anon','public.resolve_qr_target(text)','execute') then raise exception 'QR broken'; end if;
end $$;

-- Synthetic identities only; this script is transactionally rolled back by runner.
insert into auth.users(id, email) values
 ('10000000-0000-0000-0000-000000000001','admin@security.test'),
 ('10000000-0000-0000-0000-000000000002','customer@security.test'),
 ('10000000-0000-0000-0000-000000000003','portal@security.test'),
 ('10000000-0000-0000-0000-000000000004','partner@security.test'),
 ('10000000-0000-0000-0000-000000000005','second-admin@security.test');
insert into public.workspace_owner(singleton,owner_id) values(true,'10000000-0000-0000-0000-000000000001');
insert into public.workspace_admins(user_id) values ('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000005');
insert into public.clients(id,company_name,owner_id) values ('20000000-0000-0000-0000-000000000001','Synthetic client','10000000-0000-0000-0000-000000000001');
insert into public.client_users(client_id,user_id,owner_id,can_upload) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001',true);
insert into public.partner_companies(id,name,slug,job_prefix) values
 ('30000000-0000-0000-0000-000000000001','Synthetic partner','synthetic','SY'),
 ('30000000-0000-0000-0000-000000000002','Other partner','other','OT');
insert into public.partner_users(user_id,company_id,display_name) values ('10000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000001','Synthetic rep');
insert into public.design_jobs(id,company_id,job_name) values
 ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Own job'),
 ('40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','Other job');

set role anon;
do $$ begin
 begin perform public.log_partner_job_event('40000000-0000-0000-0000-000000000001','job.created'); raise exception 'anonymous forged event'; exception when insufficient_privilege then null; end;
 perform * from public.resolve_qr_target('missing');
end $$;
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',false);
select set_config('request.jwt.claims','{"role":"authenticated"}',false);
set role authenticated;
do $$ begin
 if public.current_owner_id() is not null then raise exception 'customer owns workspace'; end if;
 if exists(select 1 from public.clients) then raise exception 'customer read clients'; end if;
 begin insert into public.clients(company_name,owner_id) values ('forged',auth.uid()); raise exception 'customer inserted client'; exception when insufficient_privilege then null; end;
 begin perform public.next_invoice_number(); raise exception 'customer consumed sequence'; exception when insufficient_privilege then null; end;
 begin insert into public.workspace_admins(user_id) values(auth.uid()); raise exception 'self promotion'; exception when insufficient_privilege then null; end;
 begin perform public.log_partner_job_event('40000000-0000-0000-0000-000000000001','job.created'); raise exception 'customer forged event'; exception when insufficient_privilege then null; end;
 begin insert into public.company_settings(owner_id) values(auth.uid()); raise exception 'customer inserted settings'; exception when insufficient_privilege then null; end;
 begin insert into public.invoices(owner_id,invoice_number) values(auth.uid(),'FORGED'); raise exception 'customer inserted invoice'; exception when insufficient_privilege then null; end;
 begin insert into public.qr_codes(name,slug,raw_value) values('forged','forged','https://example.test'); raise exception 'customer inserted QR'; exception when insufficient_privilege then null; end;
 begin insert into storage.objects(bucket_id,name) values('client-files','20000000-0000-0000-0000-000000000001/uploads/forged.png'); raise exception 'customer stored client file'; exception when insufficient_privilege then null; end;
 begin insert into public.tasks(title,owner_id) values('forged',auth.uid()); raise exception 'customer inserted task'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',false);
set role authenticated;
do $$ declare inv uuid; begin
 if public.current_owner_id() <> '10000000-0000-0000-0000-000000000001' then raise exception 'canonical mapping broken'; end if;
 if (select count(*) from public.clients) <> 1 then raise exception 'shared admin read broken'; end if;
 insert into public.invoices(owner_id,client_id,status) values(public.current_owner_id(),'20000000-0000-0000-0000-000000000001','sent') returning id into inv;
 insert into public.invoice_items(owner_id,invoice_id,description,quantity,unit_price) values(public.current_owner_id(),inv,'Synthetic',2,10);
 if (select total from public.invoices where id=inv) <> 20 then raise exception 'invoice trigger broken'; end if;
 insert into public.payments(owner_id,invoice_id,amount) values(public.current_owner_id(),inv,5);
 begin update public.clients set owner_id='10000000-0000-0000-0000-000000000002'; raise exception 'admin reassigned owner'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',false);
set role authenticated;
do $$ begin
 if (select count(*) from public.clients) <> 1 or (select count(*) from public.invoices) <> 1 then raise exception 'portal read broken'; end if;
 begin insert into public.clients(company_name,owner_id) values('forged',auth.uid()); raise exception 'portal admin write'; exception when insufficient_privilege then null; end;
 perform public.clear_must_change_password();
end $$;
reset role;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',false);
set role authenticated;
do $$ begin
 perform public.log_partner_job_event('40000000-0000-0000-0000-000000000001','job.updated','{"products":2}');
 begin perform public.log_partner_job_event('40000000-0000-0000-0000-000000000002','job.updated'); raise exception 'cross partner event'; exception when insufficient_privilege then null; end;
 begin perform public.log_partner_job_event('40000000-0000-0000-0000-000000000001','bad'); raise exception 'invalid event accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.log_partner_job_event('40000000-0000-0000-0000-000000000001','job.updated','{"actor_user_id":"forged"}'); raise exception 'payload accepted'; exception when invalid_parameter_value then null; end;
 update public.design_jobs set status='completed' where id='40000000-0000-0000-0000-000000000001';
 if (select status from public.design_jobs where id='40000000-0000-0000-0000-000000000001') <> 'completed' then raise exception 'partner status broken'; end if;
 begin perform public.log_partner_job_event(null,'job.deleted','{}','SY-9999','Forged'); raise exception 'forged deletion accepted'; exception when insufficient_privilege then null; end;
 delete from public.design_jobs where id='40000000-0000-0000-0000-000000000001';
 perform public.log_partner_job_event(null,'job.deleted','{}','SY-1001','Own job');
end $$;
reset role;
select set_config('request.jwt.claim.sub','',false);
-- Null UID is not service authority, even when execution is accidentally granted.
set role authenticated;
do $$ begin
 begin perform public.log_partner_job_event('40000000-0000-0000-0000-000000000001','job.created'); raise exception 'null UID bypass'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',false);
set role service_role;
do $$ begin
 perform public.log_partner_job_event('40000000-0000-0000-0000-000000000002','job.status_changed','{"from":"new","to":"completed"}',null,null,'Studio');
 if not public.consume_security_quota('synthetic-quota',1,600) then raise exception 'first quota denied'; end if;
 if public.consume_security_quota('synthetic-quota',1,600) then raise exception 'quota bypass'; end if;
 insert into public.processing_jobs(id,token_hash,kind,manifest,state)
 select gen_random_uuid(),'synthetic','cutline','{}','queued' from generate_series(1,3);
 if (select count(*) from public.claim_processing_job()) <> 1 then raise exception 'first claim failed'; end if;
 if (select count(*) from public.claim_processing_job()) <> 1 then raise exception 'second claim failed'; end if;
 if (select count(*) from public.claim_processing_job()) <> 0 then raise exception 'global concurrency bypass'; end if;
 update public.processing_jobs set started_at=now()-interval '6 minutes',attempts=2 where state='processing';
 perform * from public.claim_processing_job();
 if (select count(*) from public.processing_jobs where state='failed') <> 2 then raise exception 'abandoned worker recovery failed'; end if;
end $$;
reset role;

rollback;
