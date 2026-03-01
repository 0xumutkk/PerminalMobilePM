import { fetchMarketsForApp } from './lib/jupiter';
fetchMarketsForApp({ limit: 500, sort: "volume" }).then(res => console.log(res)).catch(console.error);
