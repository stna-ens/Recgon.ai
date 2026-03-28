const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1/scrape';
const MAX_CHARS = 8000;

export async function scrapeWebsite(url: string): Promise<string | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(FIRECRAWL_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, formats: ['markdown'] }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return null;

    const data = await res.json() as { success: boolean; data?: { markdown?: string } };
    if (!data.success || !data.data?.markdown) return null;

    const content = data.data.markdown.trim();
    return content.length > MAX_CHARS ? content.slice(0, MAX_CHARS) + '...' : content;
  } catch {
    return null;
  }
}
