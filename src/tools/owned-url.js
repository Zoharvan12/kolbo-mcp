// Generation + library URLs already live on Kolbo CDN (media.kolbo.ai, Spaces).
// Re-uploading them wastes storage and time — pass the URL through as-is.
function ownedUrl(url) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
  try {
    const host = new URL(url).hostname;
    return /(?:^|\.)kolbo\.ai$/.test(host) || /digitaloceanspaces\.com$/.test(host);
  } catch {
    return false;
  }
}

module.exports = { ownedUrl };
