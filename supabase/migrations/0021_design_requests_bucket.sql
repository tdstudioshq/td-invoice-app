-- TD Studios Invoice App — private Storage bucket for custom design requests
--
-- Backs the public /custom-design-request form. Formspree (the form's email
-- backend) rejects file attachments on the free plan, so reference files are
-- uploaded here instead and the email carries 30-day signed download links.
--
-- Object key convention:  {request_id}/{timestamp}-{filename}
--   where request_id is a server-generated uuid per submission.
--
-- The bucket is private and there are NO storage.objects policies: every
-- operation goes through the service-role client inside the server actions in
-- app/actions/design-requests.ts (mint signed upload URL → verify via
-- storage.info() → mint signed download URL). Anonymous visitors only ever
-- hold single-object signed URLs — they can never list or read the bucket.
--
-- file_size_limit mirrors MAX_UPLOAD_BYTES (25 MB) so Storage itself caps the
-- bytes accepted by a signed upload URL.
insert into storage.buckets (id, name, public, file_size_limit)
values ('design-requests', 'design-requests', false, 25 * 1024 * 1024)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;
