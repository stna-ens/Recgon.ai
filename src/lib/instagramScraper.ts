import fs from 'fs';
import path from 'path';

// Instagram aggressively blocks unauthenticated scraping. If Puppeteer fails,
// we throw a clear error so the user knows to switch to manual mode.

const CACHE_FILE = path.join(process.cwd(), 'data/feedback_cache.json');

const GARBAGE_PATTERNS = [
  /log in/i, /sign up/i, /about/i, /help/i, /press/i, /\bapi\b/i, /jobs/i, /privacy/i, /terms/i,
  /locations/i, /instagram lite/i, /threads/i, /contact uploading/i, /meta verified/i,
  /^follow$/i, /view more comments/i, /don't miss/i, /log in to see more/i,
  /gelişmelerden haberdar/i, /kaydol/i, /gönderiyi kaçırma/i, /daha fazla/i,
  /hesabın mı var/i, /giriş yap/i, /şimdi değil/i, /hiçbir gönderiyi kaçırma/i
];

function getCachedComments(key: string): string[] | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    return data[key] || null;
  } catch {
    return null;
  }
}

function saveToCache(key: string, comments: string[]) {
  try {
    let data: Record<string, string[]> = {};
    if (fs.existsSync(CACHE_FILE)) {
      data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    }
    data[key] = comments;
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
    console.log(`[Scraper] Saved "${key}" to cache.`);
  } catch (error) {
    console.error('[Scraper] Cache save error:', error);
  }
}

function extractCommentTexts(page: { evaluate: Function }): Promise<string[]> {
  return page.evaluate(() => {
    const results: string[] = [];
    const garbagePatterns = [
      /log in/i, /sign up/i, /about/i, /help/i, /press/i, /\bapi\b/i, /jobs/i, /privacy/i, /terms/i,
      /locations/i, /instagram lite/i, /threads/i, /contact uploading/i, /meta verified/i,
      /^follow$/i, /view more comments/i, /don't miss/i, /log in to see more/i,
      /gelişmelerden haberdar/i, /kaydol/i, /gönderiyi kaçırma/i, /daha fazla/i,
      /hesabın mı var/i, /giriş yap/i, /şimdi değil/i, /hiçbir gönderiyi kaçırma/i
    ];
    const selectors = ['ul li div span', 'div[role="button"] span', 'span'];
    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        const text = (el as HTMLElement).textContent?.trim();
        if (text && text.length > 10 && text.includes(' ') && text.length < 500) {
          if (!garbagePatterns.some(p => p.test(text))) {
            results.push(text);
          }
        }
      });
    });
    return Array.from(new Set(results)).slice(0, 15);
  });
}

/** Fetch comments from a specific post/reel URL */
export async function fetchInstagramComments(postUrl: string): Promise<string[]> {
  const cleanUrl = postUrl.trim();
  if (!cleanUrl.includes('instagram.com/')) {
    throw new Error('Invalid Instagram URL');
  }

  const match = cleanUrl.match(/\/p\/([^\/?#]+)/) || cleanUrl.match(/\/reel\/([^\/?#]+)/);
  const shortcode = match ? match[1] : null;
  if (!shortcode) throw new Error('Could not extract post ID from the URL.');

  console.log(`[Scraper] Extracted shortcode: ${shortcode}`);
  const cached = getCachedComments(shortcode);
  if (cached) {
    console.log(`[Scraper] Cache HIT for ${shortcode}`);
    return cached;
  }

  let puppeteer;
  try { puppeteer = require('puppeteer'); } catch {
    throw new Error('Puppeteer is not installed. Instagram scraping is unavailable. Please use Manual mode instead.');
  }

  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    console.log(`[Scraper] Navigating to ${cleanUrl}...`);
    await page.goto(cleanUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    const comments = await extractCommentTexts(page);
    console.log(`[Scraper] Found ${comments.length} potential comments.`);
    if (comments.length > 1) {
      saveToCache(shortcode, comments);
      return comments;
    }
    throw new Error('Instagram blocked the request or the post has no accessible comments. Instagram increasingly restricts automated access — try Manual mode instead.');
  } catch (error) {
    if (error instanceof Error && error.message.includes('Instagram')) throw error;
    console.error('[Scraper] Puppeteer error:', error);
    throw new Error('Failed to scrape Instagram. Instagram actively blocks automated access. Please use Manual mode to paste feedback instead.');
  } finally {
    if (browser) await browser.close();
  }
}

/** Fetch comments from all recent posts on an Instagram profile page */
export async function fetchInstagramProfileComments(profileUrl: string): Promise<string[]> {
  const cleanUrl = profileUrl.trim().replace(/\/$/, '');
  if (!cleanUrl.includes('instagram.com/')) {
    throw new Error('Invalid Instagram URL');
  }

  // Extract the username from the profile URL
  const usernameMatch = cleanUrl.match(/instagram\.com\/([^/?#]+)/);
  const username = usernameMatch ? usernameMatch[1] : null;
  if (!username || ['p', 'reel', 'explore', 'accounts'].includes(username)) {
    throw new Error('Please provide an Instagram profile URL (e.g. https://www.instagram.com/username/)');
  }

  const cacheKey = `profile:${username}`;
  const cached = getCachedComments(cacheKey);
  if (cached) {
    console.log(`[Scraper] Cache HIT for profile ${username}`);
    return cached;
  }

  let puppeteer;
  try { puppeteer = require('puppeteer'); } catch {
    throw new Error('Puppeteer is not installed. Instagram scraping is unavailable. Please use Manual mode instead.');
  }

  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log(`[Scraper] Navigating to profile: ${cleanUrl}/`);
    await page.goto(`${cleanUrl}/`, { waitUntil: 'networkidle2', timeout: 30000 });

    // Collect post links from the profile grid
    const postLinks: string[] = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]'));
      const hrefs = anchors
        .map((a: Element) => (a as HTMLAnchorElement).href)
        .filter((h: string) => h.includes('/p/') || h.includes('/reel/'));
      return Array.from(new Set(hrefs)).slice(0, 5); // up to 5 posts
    });

    console.log(`[Scraper] Found ${postLinks.length} post links on profile.`);

    if (postLinks.length === 0) {
      throw new Error('No posts found on this profile. Instagram may have blocked access or the profile is private. Please use Manual mode instead.');
    }

    const allComments: string[] = [];

    for (const postUrl of postLinks) {
      try {
        console.log(`[Scraper] Fetching comments from: ${postUrl}`);
        await page.goto(postUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        const comments = await extractCommentTexts(page);
        allComments.push(...comments);
      } catch (err) {
        console.error(`[Scraper] Failed to get comments for ${postUrl}:`, err);
      }
    }

    const unique = Array.from(new Set(allComments)).slice(0, 50);
    console.log(`[Scraper] Total unique comments collected: ${unique.length}`);

    if (unique.length > 0) {
      saveToCache(cacheKey, unique);
      return unique;
    }

    throw new Error('Could not extract any comments from this profile. Instagram actively blocks automated access. Please use Manual mode to paste feedback instead.');
  } catch (error) {
    if (error instanceof Error && error.message.includes('Instagram')) throw error;
    console.error('[Scraper] Puppeteer error:', error);
    throw new Error('Failed to scrape Instagram profile. Instagram actively blocks automated access. Please use Manual mode to paste feedback instead.');
  } finally {
    if (browser) await browser.close();
  }
}
