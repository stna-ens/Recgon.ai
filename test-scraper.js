
const { fetchInstagramComments } = require('./src/lib/instagramScraper.ts');

async function test() {
  try {
    const url = 'https://www.instagram.com/p/DV59WN5iNbd/';
    console.log('Testing scraper with:', url);
    const comments = await fetchInstagramComments(url);
    console.log('Scraped comments:', comments);
  } catch (err) {
    console.error('Test failed:', err);
  }
}

test();
