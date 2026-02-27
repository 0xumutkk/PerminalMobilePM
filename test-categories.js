
const { fetchMarketsForApp } = require('./lib/dflow');

async function test() {
    try {
        const result = await fetchMarketsForApp({ limit: 10 });
        console.log('Categories:', result.categories);
        console.log('Market count:', result.markets.length);
        if (result.markets.length > 0) {
            console.log('Sample market category:', result.markets[0].category);
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

test();
