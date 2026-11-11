'use strict';

const fs = require('fs');

// Local stdio only: the agent names a path and we upload it. A prompt-injected agent could
// name a credential store. Refuse the well-known secret locations (never media or documents);
// KOLBO_ALLOW_SENSITIVE_LOCAL_FILES=1 lifts it. ponytail: deny-list, not an allow-list; an
// extension allow-list or confirm prompt is a product call.
const SECRET_DIRS = new Set(['.ssh', '.aws', '.gnupg', '.kube', '.azure', '.docker', '.gcloud', '.git', '.password-store']);
const SECRET_PATH_PARTS = [
  '/.config/gcloud/', '/.config/gh/', '/.config/rclone/', '/.config/kolbo/',
  '/google/chrome/', '/google-chrome/', '/chromium/', '/microsoft/edge/', '/microsoft-edge/', '/bravesoftware/', '/brave-browser/',
  '/mozilla/firefox/', '/.mozilla/', '/library/keychains/', '/etc/shadow', '/etc/sudoers',
  '/.config/git/credentials', '/.config/doctl/', '/.terraform.d/credentials', '/.cargo/credentials', '/.local/share/keyrings/',
];
const SECRET_NAMES = [
  /^(.*\.)?env$/, // .env, prod.env
  /^\.env\.(?!example$|sample$|template$|dist$).+$/, // .env.production
  /^\.(envrc|npmrc|netrc|pgpass|pypirc|git-credentials|claude\.json|credentials\.json|vault-token)$/,
  /^_netrc$/, // Windows netrc
  /^\.(bash|zsh|sh|python|psql|mysql)_history$/,
  /^(credentials\.json|secrets?\.(json|ya?ml|toml)|partner\.json|auth\.json|rclone\.conf)$/,
  /\.(tfstate|tfstate\.backup|pem|pfx|p12|ppk|kdbx|keystore)$/,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/,
];

// A private key is text ("-----BEGIN"); a Keynote .key is a zip ("PK"). Only the former is a secret.
// Any file, whatever its name or folder (custom-named SSH keys), is refused when it opens like a private key.
function head(f) {
  try {
    if (!fs.statSync(f).isFile()) return null; // never open a FIFO/device: openSync would block the event loop
    const fd = fs.openSync(f, 'r');
    try { const b = Buffer.alloc(512); return b.toString('latin1', 0, fs.readSync(fd, b, 0, 512, 0)); } finally { fs.closeSync(fd); }
  } catch (_) { return null; } // unreadable or missing: the upload fails on its own
}
const PRIVATE_KEY_HEAD = /^(\xEF\xBB\xBF)?\s*(Bag Attributes[\s\S]*?)?(-----BEGIN [A-Z0-9 ]*PRIVATE KEY|PuTTY-User-Key-File|openssh-key-v1)/;

function isSensitiveLocalPath(p) {
  const forms = [String(p)];
  try {
    // .native expands Windows 8.3 aliases (DOCKER~1 -> .docker, ENV~1 -> .env); plain realpathSync leaves them.
    forms.push(fs.realpathSync(p), fs.realpathSync.native(p));
    const st = fs.statSync(p);
    if (!st.isFile() && !st.isDirectory()) return true; // FIFO / device / socket: refuse, never open
  } catch (_) { /* missing file: the caller reports it */ }
  return forms.some((f) => {
    // NTFS alternate data streams: ".env::$DATA", ".aws::$INDEX_ALLOCATION/credentials" name the same
    // file/dir as ".env" / ".aws/...", so strip ":..." from EVERY path part (also drops the drive colon).
    const parts = f.replace(/\\/g, '/').toLowerCase().split('/').map((s) => s.replace(/:.*$/, '')).filter(Boolean);
    const norm = '/' + parts.join('/');
    if (parts.slice(0, -1).some((s) => SECRET_DIRS.has(s))) return true;
    if (norm.startsWith('/proc/') || SECRET_PATH_PARTS.some((s) => norm.includes(s) || norm.endsWith(s))) return true;
    const name = parts[parts.length - 1] || '';
    if (SECRET_NAMES.some((re) => re.test(name))) return true;
    const h = head(f);
    if (h === null) return false;
    return PRIVATE_KEY_HEAD.test(h) || (name.endsWith('.key') && !h.startsWith('PK'));
  });
}

function assertLocalPathAllowed(p) {
  if (process.env.KOLBO_ALLOW_SENSITIVE_LOCAL_FILES === '1' || !isSensitiveLocalPath(p)) return;
  throw new Error(`Refusing to upload ${p}: it looks like a credential or key file (.env, .ssh, cloud/CLI credentials, private keys). Upload media or documents instead.`);
}

module.exports = { isSensitiveLocalPath, assertLocalPathAllowed };
