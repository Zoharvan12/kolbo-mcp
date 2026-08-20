/**
 * Rewrite Kolbo Spaces origin URLs to the custom-domain CDN.
 *
 * Origin (`*.digitaloceanspaces.com`) is uncached and makes every MCP image
 * / video / Visual DNA sheet crawl. Custom hosts:
 *   production  → media.kolbo.ai
 *   development → media-dev.kolbo.ai
 *   staging     → media-staging.kolbo.ai
 *   sapir       → media-sapir.kolbo.ai
 */

const HOST_MAP = [
  ['kolboai-production.ams3.cdn.digitaloceanspaces.com', 'media.kolbo.ai'],
  ['kolboai-production.ams3.digitaloceanspaces.com', 'media.kolbo.ai'],
  ['kolboai-development.ams3.cdn.digitaloceanspaces.com', 'media-dev.kolbo.ai'],
  ['kolboai-development.ams3.digitaloceanspaces.com', 'media-dev.kolbo.ai'],
  ['kolboai-staging.ams3.cdn.digitaloceanspaces.com', 'media-staging.kolbo.ai'],
  ['kolboai-staging.ams3.digitaloceanspaces.com', 'media-staging.kolbo.ai'],
  ['kolboai-sapir.ams3.cdn.digitaloceanspaces.com', 'media-sapir.kolbo.ai'],
  ['kolboai-sapir.ams3.digitaloceanspaces.com', 'media-sapir.kolbo.ai'],
];

const URL_IN_TEXT = /https?:\/\/[^\s"'<>\\]+/gi;
const SKIP_KEYS = /^(upload_url|uploadUrl|signed_url|signedUrl|presigned_url|presignedUrl|put_url|putUrl)$/;

function rewriteUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (/[?&](X-Amz-Algorithm|AWSAccessKeyId|Signature=)/i.test(url)) return url;
  let out = url;
  for (const [from, to] of HOST_MAP) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  return out;
}

function rewriteTree(value, seen) {
  const visited = seen || new WeakSet();
  if (typeof value === 'string') {
    if (!value.includes('digitaloceanspaces.com')) return value;
    if (/^https?:\/\//i.test(value) && !/\s/.test(value)) return rewriteUrl(value);
    return value.replace(URL_IN_TEXT, rewriteUrl);
  }
  if (!value || typeof value !== 'object') return value;
  if (visited.has(value)) return value;
  visited.add(value);
  if (Array.isArray(value)) return value.map((item) => rewriteTree(item, visited));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SKIP_KEYS.test(key) ? item : rewriteTree(item, visited);
  }
  return out;
}

module.exports = { rewriteUrl, rewriteTree, HOST_MAP };
