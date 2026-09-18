async function getCredentials() {
    const data = await chrome.storage.local.get(['apiUrl', 'apiKey']);
    if (!data.apiUrl || !data.apiKey) return null;
    return { apiUrl: data.apiUrl.replace(/\/$/, ''), apiKey: data.apiKey };
}

export async function fetchJobs() {
    const creds = await getCredentials();
    if (!creds) return null;
    try {
        const res = await fetch(`${creds.apiUrl}/api/extension/jobs`, {
            headers: { 'X-Extension-Key': creds.apiKey }
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (e) { return null; }
}

export async function startJobOnServer(jobId) {
    const creds = await getCredentials();
    if (!creds) return false;
    try {
        const res = await fetch(`${creds.apiUrl}/api/extension/jobs/${jobId}/start`, {
            method: 'POST',
            headers: { 'X-Extension-Key': creds.apiKey }
        });
        return res.ok;
    } catch (e) { return false; }
}

export async function uploadResults(payload) {
    const creds = await getCredentials();
    if (!creds) return { ok: false, status: 0 };
    try {
        const res = await fetch(`${creds.apiUrl}/api/extension/upload`, {
            method: 'POST',
            headers: { 'X-Extension-Key': creds.apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return { ok: res.ok, status: res.status };
    } catch (e) { return { ok: false, status: 0 }; }
}

export async function completeJobOnServer(jobId, payload) {
    const creds = await getCredentials();
    if (!creds) return false;
    try {
        const res = await fetch(`${creds.apiUrl}/api/extension/jobs/${jobId}/complete`, {
            method: 'POST',
            headers: { 'X-Extension-Key': creds.apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return res.ok;
    } catch (e) { return false; }
}

export async function checkConfig() {
    const creds = await getCredentials();
    if (!creds) throw new Error("Missing config");
    const res = await fetch(`${creds.apiUrl}/api/extension/config`, {
        headers: { 'X-Extension-Key': creds.apiKey }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
}
