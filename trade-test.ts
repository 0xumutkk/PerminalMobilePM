import "dotenv/config";
const JUPITER_API_KEY = process.env.EXPO_PUBLIC_JUPITER_API_KEY || "";
const JUPITER_BASE_URL = "https://api.jup.ag/prediction/v1";

async function testTrade() {
    const payload = {
        ownerPubkey: "8bqcNNYMiEiUyF2qd9wXRjA4fdsr556bQFajz4cSTUpd",
        marketId: "POLY-559652",
        isYes: true,
        isBuy: true,
        contracts: "1",
        maxBuyPriceUsd: "300000",
    };

    console.log("Testing with payload:", JSON.stringify(payload));

    const res = await fetch(`${JUPITER_BASE_URL}/orders`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": JUPITER_API_KEY,
        },
        body: JSON.stringify(payload),
    });

    const body = await res.text();
    console.log(`Status: ${res.status}`);
    console.log(`Body: ${body}`);
}

testTrade();
