import "dotenv/config";
import { fetchMarketsForApp } from "./lib/jupiter";

async function run() {
    try {
        console.log("Fetching...");
        const res = await fetchMarketsForApp({ limit: 500, sort: "volume" });
        console.log("Markets found:", res.markets.length);
        console.log("Next cursor:", res.nextCursor);
    } catch (e) {
        console.error(e);
    }
}
run();
