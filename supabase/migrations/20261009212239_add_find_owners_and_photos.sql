-- Finds of signed-in users, and their photos.
--
-- Signed-out visitors can still share finds anonymously, with no user id. A
-- signed-in user's finds are always stored, with their user id, which the
-- share-find edge function takes from their session, never from the request
-- body. Their photos go to the private `find-photos` bucket, under a folder
-- named after their user id: `<user id>/<find id>.jpg`.

ALTER TABLE shared_finds
    -- Null for anonymous finds; set to null too if the account is deleted, which leaves the find anonymous.
    ADD COLUMN user_id     uuid REFERENCES auth.users (id) ON DELETE SET NULL,
    -- Path of the photo in the find-photos bucket.
    ADD COLUMN photo_path  text CHECK (length(photo_path) BETWEEN 1 AND 200);

CREATE INDEX shared_finds_user_id_idx ON shared_finds (user_id);

-- Private: photos are only readable by their owner, or through signed URLs. The
-- app downscales them to JPEG before uploading. The bucket may already exist,
-- created from the dashboard: it is made private with these limits.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('find-photos', 'find-photos', false, 5242880, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Each user manages the photos in their own folder. Upload retries overwrite
-- the photo (upsert), which needs SELECT and UPDATE as well as INSERT.
CREATE POLICY "Users upload photos of their finds" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'find-photos' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY "Users read photos of their finds" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'find-photos' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY "Users replace photos of their finds" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'find-photos' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text)
    WITH CHECK (bucket_id = 'find-photos' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

CREATE POLICY "Users delete photos of their finds" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'find-photos' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
