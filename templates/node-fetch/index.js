const raw = process.env.FLOOM_INPUTS || "{}";
const inputs = JSON.parse(raw);
const url = String(inputs.url || "https://example.com");

const response = await fetch(url);
const html = await response.text();
const match = html.match(/<title[^>]*>(.*?)<\/title>/i);

console.log(
  JSON.stringify({
    url,
    title: match ? match[1].trim() : "",
    status: response.status,
  })
);
