
async function run() {
    const JUPITER_API_KEY = "5b138a64-390d-4878-8db9-126ec1c161f8";
    const JUPITER_BASE_URL = "https://api.jup.ag/prediction/v1";

    console.log("Testing Jupiter API...");
    const url = `${JUPITER_BASE_URL}/events?provider=polymarket&start=1&end=10&includeMarkets=true&sortBy=volume&sortDirection=desc`;

    try {
        const response = await fetch(url, {
            headers: {
                "Accept": "application/json",
                "x-api-key": JUPITER_API_KEY
            }
        });

        console.log("Status:", response.status);
        if (!response.ok) {
            const text = await response.text();
            console.log("Error:", text);
            return;
        }

        const data = await response.json();
        console.log("Events found:", data.data ? data.data.length : 0);
        if (data.data && data.data.length > 0) {
            console.log("First event title:", data.data[0].title);
            console.log("Markets in first event:", data.data[0].markets ? data.data[0].markets.length : 0);
        }
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}
run();
