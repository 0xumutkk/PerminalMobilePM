-- Add PnL and Win Rate columns if they don't exist
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS pnl NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS win_rate NUMERIC DEFAULT 0;

-- Insert Mock Users (Upsert on ID/Username to avoid duplicates)
INSERT INTO public.profiles (id, username, display_name, bio, avatar_url, followers_count, following_count, trades_count, pnl, win_rate)
VALUES
  ('mock-1', 'crypto_king', 'Crypto King 👑', 'Early bitcoin adopter. degenerate trader. nfa.', 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=200&h=200&fit=crop', 12500, 420, 1543, 45200.50, 68),
  ('mock-2', 'solana_summer', 'Solana Summer ☀️', 'SOL maxi. Building on Perminal.', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop', 8400, 150, 892, 12500.00, 72),
  ('mock-3', 'bear_slayer', 'Bear Slayer 🐻', 'Permabull. Stocks & Crypto.', 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200&h=200&fit=crop', 5600, 890, 2100, -1500.00, 48),
  ('mock-4', 'prediction_pro', 'Prediction Pro', 'Data scientist analyzing market trends.', 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=200&h=200&fit=crop', 3200, 120, 450, 8900.25, 61),
  ('mock-5', 'polymarket_whale', 'Poly Whale 🐳', 'Top 100 on Polymarket. Moving to Perminal.', 'https://images.unsplash.com/photo-1633332755192-727a05c4013d?w=200&h=200&fit=crop', 15200, 50, 5400, 156000.00, 82),
  ('mock-6', 'nft_degen', 'NFT Degen', 'Flipping JPEGs and predicting floors.', 'https://images.unsplash.com/photo-1542909168-82c3e7fdca5c?w=200&h=200&fit=crop', 4100, 2300, 670, 2300.00, 55),
  ('mock-7', 'macro_guru', 'Macro Guru', 'Rates, Inflation, Geopolitics.', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop', 9800, 45, 120, 5600.00, 65),
  ('mock-8', 'newbie_trader', 'Just Started', 'Learning the ropes. Follow for my journey.', NULL, 120, 450, 15, -450.00, 40),
  ('mock-9', 'fomo_sapiens', 'FOMO Sapiens', 'I buy tops and sell bottoms.', NULL, 2300, 1200, 3400, -12500.00, 35),
  ('mock-10', 'alpha_leak', 'Alpha Leak 💧', 'Insider info (jk).', 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=200&h=200&fit=crop', 6700, 340, 890, 7800.00, 59)
ON CONFLICT (id) DO NOTHING;

-- If usernames conflict but IDs don't (rare with hardcoded IDs), do nothing
-- (Postgres requires unique constraint for ON CONFLICT, which we have on username)
