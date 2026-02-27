// Expo loads .env automatically; extra ensures DFlow vars are available at runtime via Constants
const { expo } = require("./app.json");

const PUBLIC_MARKETS_URL = "https://prediction-markets-api.dflow.net";
const AUTH_MARKETS_URL = "https://a.prediction-markets-api.dflow.net";
const PUBLIC_TRADE_URL = "https://quote-api.dflow.net";
const AUTH_TRADE_URL = "https://a.quote-api.dflow.net";

const dflowApiKey = process.env.EXPO_PUBLIC_DFLOW_API_KEY?.trim() ?? "";
const envMarketsUrl = process.env.EXPO_PUBLIC_DFLOW_MARKETS_API_URL?.trim() ?? "";
const envTradeUrl = process.env.EXPO_PUBLIC_DFLOW_TRADE_API_URL?.trim() ?? "";
// If no explicit URL is configured, use authenticated production endpoints when API key is present.
const dflowMarketsUrl = envMarketsUrl || (dflowApiKey ? AUTH_MARKETS_URL : PUBLIC_MARKETS_URL);
const dflowTradeUrl = envTradeUrl || (dflowApiKey ? AUTH_TRADE_URL : PUBLIC_TRADE_URL);

module.exports = {
    expo: {
        ...expo,
        extra: {
            dflowApiKey,
            dflowMarketsUrl,
            dflowTradeUrl,
            jupiterApiKey: process.env.EXPO_PUBLIC_JUPITER_API_KEY?.trim() ?? "",
        },
    },
};
