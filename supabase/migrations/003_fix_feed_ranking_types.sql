DROP FUNCTION IF EXISTS get_feed_ranking(integer, integer);

CREATE OR REPLACE FUNCTION get_feed_ranking(page integer DEFAULT 1, page_size integer DEFAULT 20)
RETURNS TABLE (
    id UUID,
    user_id TEXT,
    market_id TEXT,
    post_type TEXT,
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
            (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS likes_count
        FROM posts p
    )
    SELECT
        ps.*,
        wilson_score(ps.likes_count::int, 0) AS score
    FROM post_stats ps
    ORDER BY score DESC, ps.created_at DESC
    LIMIT page_size
    OFFSET (page - 1) * page_size;
END;
$$;
