/**
 * Kolbo API HTTP client wrapper
 */

/**
 * Structured error thrown when the Kolbo API returns a non-OK response.
 * Preserves the SDK's error code, HTTP status, and full response data so
 * MCP tools (and the LLM consuming them) can distinguish NOT_FOUND from
 * INSUFFICIENT_CREDITS from VALIDATION_ERROR etc.
 */
class KolboApiError extends Error {
  constructor(message, { code, status, data } = {}) {
    super(message);
    this.name = 'KolboApiError';
    this.code = code || null;
    this.status = status || null;
    this.data = data || null;
  }
}

class KolboClient {
  constructor() {
    this.apiKey = process.env.KOLBO_API_KEY;
    this.baseUrl = (process.env.KOLBO_API_URL || 'https://api.kolbo.ai/api').replace(/\/$/, '');

    if (!this.apiKey) {
      throw new Error('KOLBO_API_KEY environment variable is required');
    }
  }

  async request(method, path, body = null) {
    const url = `${this.baseUrl}${path}`;
    const options = {
      method,
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json'
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    let data;
    try {
      data = await response.json();
    } catch (_) {
      // Non-JSON body (gateway error, HTML etc.)
      throw new KolboApiError(`API error: ${response.status} ${response.statusText}`, {
        status: response.status,
        data: null
      });
    }

    if (!response.ok || data.success === false) {
      const message = data.error || data.message || `API error: ${response.status}`;
      const code = data.code || null;
      // Surface the code in the message so the LLM sees it even if it ignores the .code property
      const fullMessage = code ? `${message} [${code}]` : message;
      throw new KolboApiError(fullMessage, {
        code,
        status: response.status,
        data
      });
    }

    return data;
  }

  async post(path, body) {
    return this.request('POST', path, body);
  }

  async get(path) {
    return this.request('GET', path);
  }

  async delete(path) {
    return this.request('DELETE', path);
  }

  async postMultipart(path, formData) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'X-API-Key': this.apiKey,
      ...formData.getHeaders()
    };

    // form-data exposes getLengthSync for known-size parts; set Content-Length when available.
    try {
      const len = formData.getLengthSync();
      if (len) headers['Content-Length'] = String(len);
    } catch (_) { /* streaming length unavailable — let fetch handle it */ }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData,
      duplex: 'half'
    });

    let data;
    try {
      data = await response.json();
    } catch (_) {
      throw new KolboApiError(`API error: ${response.status} ${response.statusText}`, {
        status: response.status,
        data: null
      });
    }

    if (!response.ok || data.success === false) {
      const message = data.error || data.message || `API error: ${response.status}`;
      const code = data.code || null;
      const fullMessage = code ? `${message} [${code}]` : message;
      throw new KolboApiError(fullMessage, {
        code,
        status: response.status,
        data
      });
    }

    return data;
  }
}

module.exports = KolboClient;
module.exports.KolboApiError = KolboApiError;
