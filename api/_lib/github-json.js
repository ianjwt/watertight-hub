// Shared helper for reading/writing JSON files in this repo via the GitHub Contents API —
// same commit-as-database pattern as api/client-config.js, factored out so the Edit Tracker's
// read/write/cron endpoints don't duplicate it.

const REPO = 'ianjwt/watertight-hub';

function apiUrl(path) {
  return `https://api.github.com/repos/${REPO}/contents/${path}`;
}

function authHeaders(token) {
  return { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github.v3+json' };
}

export async function githubGetJson(path, token) {
  const res  = await fetch(apiUrl(path), { headers: authHeaders(token) });
  const data = await res.json();

  if (res.status === 401) {
    const err = new Error('GitHub token not configured or invalid');
    err.status = 401;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(data.message || `GitHub GET failed ${res.status}`);
    err.status = res.status;
    throw err;
  }
  if (!data.content) {
    throw new Error('GitHub response missing content field');
  }

  const decoded = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');
  return { content: JSON.parse(decoded), sha: data.sha };
}

async function githubPutJson(path, token, content, sha, message) {
  const body = Buffer.from(JSON.stringify(content, null, 2)).toString('base64');
  const res  = await fetch(apiUrl(path), {
    method: 'PUT',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: body, sha }),
  });
  const data = await res.json();

  if (!res.ok) {
    const err = new Error(data.message || `GitHub PUT failed ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Fetches the file, applies `mutate(content) => newContent`, and PUTs the result.
// On a 409 (sha changed under us — someone else wrote in between), re-fetches fresh
// content and the current sha, re-applies `mutate`, and retries once before giving up.
export async function githubUpdateJson(path, token, mutate, message) {
  let attempt  = 0;
  const maxTry = 2;

  while (true) {
    attempt++;
    const { content, sha } = await githubGetJson(path, token);
    const updated = await mutate(content);

    try {
      await githubPutJson(path, token, updated, sha, message);
      return updated;
    } catch (err) {
      if (err.status === 409 && attempt < maxTry) continue;
      throw err;
    }
  }
}

export { REPO };
