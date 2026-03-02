
(global as any).__DEV__ = true;
import "dotenv/config";
import { fetchMarketsForApp } from "./lib/jupiter";

async function run() {
    try {
        console.log("Fetching...");
        const res = await fetchMarketsForApp({ limit: 100, sort: "volume" });
        console.log("Markets found:", res.markets.length);
        if (res.markets.length > 0) {
            console.log("First market:", res.markets[0].title);
        }
        console.log("Next cursor:", res.nextCursor);
    } catch (e) {
        console.error(e);
    }
}
run();
