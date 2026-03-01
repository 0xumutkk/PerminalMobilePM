-- 1. Wilson Score Function
CREATE OR REPLACE FUNCTION wilson_score(upvotes integer, downvotes integer)
RETURNS numeric
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
    n integer;
    z numeric := 1.96; -- 95% confidence
    phat numeric;
    score numeric;
BEGIN
    n := upvotes + downvotes;
    IF n = 0 THEN
        RETURN 0;
    END IF;
    
    phat := upvotes::numeric / n;
    
    score := (phat + z*z/(2*n) - z * sqrt((phat*(1-phat)/n) + (z*z/(4*n*n)))) / (1 + z*z/n);
    RETURN score;
END;
$$;

-- 2. Feed Ranking RPC
-- This RPC will be called from the client: supabase.rpc('get_feed_ranking')
CREATE OR REPLACE FUNCTION get_feed_ranking(page integer DEFAULT 1, page_size integer DEFAULT 20)
RETURNS TABLE (
    id UUID,
    user_id TEXT,
    market_id UUID,
    post_type post_type_enum,
    content TEXT,
    trade_metadata JSONB,
    is_verified BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    likes_count BIGINT,
    score NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH post_stats AS (
        SELECT 
            p.id,
            p.user_id,
            p.market_id,
            p.post_type,
            p.content,
            p.trade_metadata,
            p.is_verified,
            p.created_at,
            p.updated_at,
            (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) as likes_count
        FROM posts p
    )
    SELECT 
        ps.*,
        wilson_score(ps.likes_count::int, 0) as score -- Defaulting downvotes to 0 as there is no downvote feature
    FROM post_stats ps
    ORDER BY score DESC, ps.created_at DESC
    LIMIT page_size
    OFFSET (page - 1) * page_size;
END;
$$;
