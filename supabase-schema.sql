-- Perminal Social Features Schema (Idempotent Version)
-- Run this in your Supabase SQL Editor
-- Safe to run multiple times

-- ============================================
-- 1. PROFILES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT PRIMARY KEY,
  wallet_address TEXT,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  followers_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  trades_count INTEGER DEFAULT 0,
  pnl NUMERIC DEFAULT 0,
  win_rate NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes (safe to run multiple times)
CREATE INDEX IF NOT EXISTS profiles_username_idx ON public.profiles (username);
CREATE INDEX IF NOT EXISTS profiles_wallet_address_idx ON public.profiles (wallet_address);

-- ============================================
-- 2. FOLLOWS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS follows_follower_idx ON public.follows (follower_id);
CREATE INDEX IF NOT EXISTS follows_following_idx ON public.follows (following_id);

-- ============================================
-- 3. RPC FUNCTIONS (CREATE OR REPLACE)
-- ============================================

CREATE OR REPLACE FUNCTION increment_followers(user_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET followers_count = followers_count + 1
  WHERE id = user_id;
END;
$$;

CREATE OR REPLACE FUNCTION decrement_followers(user_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET followers_count = GREATEST(0, followers_count - 1)
  WHERE id = user_id;
END;
$$;

CREATE OR REPLACE FUNCTION increment_following(user_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET following_count = following_count + 1
  WHERE id = user_id;
END;
$$;

CREATE OR REPLACE FUNCTION decrement_following(user_id TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET following_count = GREATEST(0, following_count - 1)
  WHERE id = user_id;
END;
$$;

-- ============================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Drop existing policies first (idempotent)
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Follows are viewable by everyone" ON public.follows;
DROP POLICY IF EXISTS "Users can follow others" ON public.follows;
DROP POLICY IF EXISTS "Users can unfollow" ON public.follows;

-- Recreate policies
CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (true);

CREATE POLICY "Follows are viewable by everyone"
  ON public.follows FOR SELECT
  USING (true);

CREATE POLICY "Users can follow others"
  ON public.follows FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can unfollow"
  ON public.follows FOR DELETE
  USING (true);

-- ============================================
-- 5. POSTS & INTERACTIONS (PHASE 2)
-- ============================================

-- Posts Table
CREATE TABLE IF NOT EXISTS public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT,
  market_id TEXT, -- Optional: Link to a prediction market
  market_slug TEXT, -- Optional: Human readable slug for the market
  market_question TEXT, -- Optional: Cached question title
  media_urls TEXT[], -- Array of image/video URLs
  likes_count INTEGER DEFAULT 0,
  reposts_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  post_type TEXT DEFAULT 'standard', -- 'standard', 'trade', 'thesis'
  trade_metadata JSONB DEFAULT '{}', -- Details about avg_entry, current_price, pnl_percent, side, shares_count
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS posts_user_id_idx ON public.posts (user_id);
CREATE INDEX IF NOT EXISTS posts_created_at_idx ON public.posts (created_at DESC);

-- Likes Table
CREATE TABLE IF NOT EXISTS public.likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, post_id)
);

CREATE INDEX IF NOT EXISTS likes_post_id_idx ON public.likes (post_id);
CREATE INDEX IF NOT EXISTS likes_user_id_idx ON public.likes (user_id);

-- Reposts Table
CREATE TABLE IF NOT EXISTS public.reposts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, post_id)
);

CREATE INDEX IF NOT EXISTS reposts_post_id_idx ON public.reposts (post_id);

-- Comments Table
CREATE TABLE IF NOT EXISTS public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comments_post_id_idx ON public.comments (post_id);

-- Interaction RPC Functions

-- Toggle Like
CREATE OR REPLACE FUNCTION toggle_like(target_post_id UUID, target_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  exists_check BOOLEAN;
BEGIN
  -- Check if like exists
  SELECT EXISTS (
    SELECT 1 FROM public.likes 
    WHERE post_id = target_post_id AND user_id = target_user_id
  ) INTO exists_check;

  IF exists_check THEN
    -- Unlike
    DELETE FROM public.likes 
    WHERE post_id = target_post_id AND user_id = target_user_id;
    
    UPDATE public.posts 
    SET likes_count = GREATEST(0, likes_count - 1)
    WHERE id = target_post_id;
    
    RETURN FALSE; -- Not liked anymore
  ELSE
    -- Like
    INSERT INTO public.likes (post_id, user_id)
    VALUES (target_post_id, target_user_id);
    
    UPDATE public.posts 
    SET likes_count = likes_count + 1
    WHERE id = target_post_id;
    
    RETURN TRUE; -- Liked
  END IF;
END;
$$;

-- Toggle Repost
CREATE OR REPLACE FUNCTION toggle_repost(target_post_id UUID, target_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  exists_check BOOLEAN;
BEGIN
  -- Check if repost exists
  SELECT EXISTS (
    SELECT 1 FROM public.reposts 
    WHERE post_id = target_post_id AND user_id = target_user_id
  ) INTO exists_check;

  IF exists_check THEN
    -- Remove Repost
    DELETE FROM public.reposts 
    WHERE post_id = target_post_id AND user_id = target_user_id;
    
    UPDATE public.posts 
    SET reposts_count = GREATEST(0, reposts_count - 1)
    WHERE id = target_post_id;
    
    RETURN FALSE;
  ELSE
    -- Repost
    INSERT INTO public.reposts (post_id, user_id)
    VALUES (target_post_id, target_user_id);
    
    UPDATE public.posts 
    SET reposts_count = reposts_count + 1
    WHERE id = target_post_id;
    
    RETURN TRUE;
  END IF;
END;
$$;

-- RLS for New Tables
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reposts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Post Policies
CREATE POLICY "Posts are viewable by everyone" ON public.posts FOR SELECT USING (true);
CREATE POLICY "Users can create posts" ON public.posts FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can delete own posts" ON public.posts FOR DELETE USING (true); -- Simplified for Phase 1

-- Interaction Policies (Simplified for now due to lack of auth.uid())
CREATE POLICY "Likes viewable by everyone" ON public.likes FOR SELECT USING (true);
CREATE POLICY "Users can like" ON public.likes FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can unlike" ON public.likes FOR DELETE USING (true);

CREATE POLICY "Reposts viewable by everyone" ON public.reposts FOR SELECT USING (true);
CREATE POLICY "Users can repost" ON public.reposts FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can unrepost" ON public.reposts FOR DELETE USING (true);

CREATE POLICY "Comments viewable by everyone" ON public.comments FOR SELECT USING (true);
CREATE POLICY "Users can comment" ON public.comments FOR INSERT WITH CHECK (true);

-- ============================================
-- 6. EXPLICIT PERMISSIONS
-- ============================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
SELECT 'Schema updated successfully with Permissions! ✅' as status;
