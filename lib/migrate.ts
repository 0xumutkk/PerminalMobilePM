import { supabase } from "../lib/supabase";

export async function migrateFigmaPosts() {
    try {
        const { data: profiles, error: pError } = await supabase.from('profiles').select('id, username').limit(1) as any;
        if (pError || !profiles || profiles.length === 0) {
            console.error("No users found");
            return { success: false, error: "No users found" };
        }
        const targetUserId = (profiles[0] as any).id;

        const posts = [
            {
                user_id: targetUserId,
                content: "Since the Q3 2025 earnings came out on October 22 showing record revenue but a profit miss no new updates this week have shifted the outlook. Social media highlights sales softness and model transitions, reinforcing negative sentiment. With no fresh data, the market’s “No” view still reflects the earlier miss.",
                market_id: 'fed-rates',
                market_slug: 'fed-rates-2025',
                market_question: "No change in Fed interest rates after December 2025 meeting?",
                post_type: 'trade',
                is_verified: true,
                trade_metadata: {
                    outcome: 'Yes',
                    shares_count: 12300,
                    total_value: 12234.56,
                    avg_entry: 0.47,
                    current_price: 0.97,
                    pnl_percent: 1234.2
                }
            },
            {
                user_id: targetUserId,
                content: "Since the Q3 2025 earnings came out on October 22 showing record revenue but a profit miss no new updates this week have shifted the outlook.",
                market_id: 'fed-rates',
                market_slug: 'fed-rates-2025',
                market_question: "No change in Fed interest rates after December 2025 meeting?",
                post_type: 'thesis',
                is_verified: false,
                trade_metadata: {
                    current_price: 0.97
                }
            },
            {
                user_id: targetUserId,
                content: "Closing out this position as the outlook has fundamentally changed.",
                market_id: 'fed-rates',
                market_slug: 'fed-rates-2025',
                market_question: "No change in Fed interest rates after December 2025 meeting?",
                post_type: 'sold',
                is_verified: true,
                trade_metadata: {
                    outcome: 'No',
                    current_price: 0.97
                }
            }
        ];

        const results = [];
        for (const post of posts) {
            const { data, error } = await supabase.from('posts').insert(post as any).select();
            if (error) console.error("Error:", error);
            else if (data) results.push((data[0] as any).id);
        }
        return { success: true, count: results.length };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
