CREATE TABLE IF NOT EXISTS public.downvotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, post_id)
);

CREATE INDEX IF NOT EXISTS downvotes_post_id_idx ON public.downvotes (post_id);
CREATE INDEX IF NOT EXISTS downvotes_user_id_idx ON public.downvotes (user_id);

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS downvotes_count INTEGER DEFAULT 0;

ALTER TABLE public.downvotes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Downvotes viewable by everyone" ON public.downvotes FOR SELECT USING (true);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "Users can downvote" ON public.downvotes FOR INSERT WITH CHECK (true);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE POLICY "Users can undownvote" ON public.downvotes FOR DELETE USING (true);
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE OR REPLACE FUNCTION toggle_downvote(target_post_id UUID, target_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  exists_check BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.downvotes 
    WHERE post_id = target_post_id AND user_id = target_user_id
  ) INTO exists_check;

  IF exists_check THEN
    DELETE FROM public.downvotes 
    WHERE post_id = target_post_id AND user_id = target_user_id;
    
    UPDATE public.posts 
    SET downvotes_count = GREATEST(0, COALESCE(downvotes_count, 0) - 1)
    WHERE id = target_post_id;
    
    RETURN FALSE;
  ELSE
    INSERT INTO public.downvotes (post_id, user_id)
    VALUES (target_post_id, target_user_id);
    
    UPDATE public.posts 
    SET downvotes_count = COALESCE(downvotes_count, 0) + 1
    WHERE id = target_post_id;
    
    RETURN TRUE;
  END IF;
END;
$$;
