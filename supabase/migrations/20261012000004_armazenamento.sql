-- RIRO · Sistema financeiro
-- 0004 · Bucket privado para prints/PDFs do fechamento do Avec

insert into storage.buckets (id, name, public)
values ('comprovantes', 'comprovantes', false)
on conflict (id) do nothing;

create policy "comprovantes_leitura" on storage.objects for select to authenticated
  using (bucket_id = 'comprovantes' and public.papel_atual() is not null);

create policy "comprovantes_envio" on storage.objects for insert to authenticated
  with check (bucket_id = 'comprovantes' and public.papel_atual() is not null);
