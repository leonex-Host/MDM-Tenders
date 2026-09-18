import { setManualActionRequired } from '../core/job-manager.js';

async function getCredentials() {
    const data = await chrome.storage.local.get(['apiUrl', 'apiKey']);
    if (!data.apiUrl || !data.apiKey) return null;
    return { apiUrl: data.apiUrl.replace(/\/$/, ''), apiKey: data.apiKey };
}

export async function fetchJobs() {
    const creds = await getCredentials();
    if (!creds) return null;
    try {
        console.log(`[BidDetailTrace] polling started`);
        console.log(`[BidDetailTrace] request method: GET`);
        console.log(`[BidDetailTrace] request endpoint: ${creds.apiUrl}/api/extension/jobs`);

        const res = await fetch(`${creds.apiUrl}/api/extension/jobs`, {
            headers: { 'X-Extension-Key': creds.apiKey }
        });

        console.log(`[Diagnostic] API URL: ${creds.apiUrl} | Key Length: ${creds.apiKey?.length || 0} | Status: ${res.status}`);
        console.log(`[BidDetailTrace] response status: ${res.status}`);

        if (res.status === 403 || res.status === 401) {
            console.error(`[BidDetailTrace] final error: Authentication blocked (HTTP ${res.status})`);
            await setManualActionRequired("API KEY REJECTED. Update extension settings.", "");
            return null;
        }
        if (!res.ok) {
            console.error(`[BidDetailTrace] final error: Server returned HTTP ${res.status}`);
            return null;
        }
        const data = await res.json();
        console.log(`[BidDetailTrace] received jobs: ${JSON.stringify(data.jobs || data).substring(0, 300)}`);
        return data;
    } catch (e) {
        console.error(`[BidDetailTrace] final error: ${e.message}`);
        return null;
    }
}

export async function startJobOnServer(jobId) {
    const creds = await getCredentials();
    if (!creds) return false;
    try {
        console.log(`[BidDetailTrace] start endpoint: POST ${creds.apiUrl}/api/extension/jobs/${jobId}/start`);
        const res = await fetch(`${creds.apiUrl}/api/extension/jobs/${jobId}/start`, {
            method: 'POST',
            headers: { 'X-Extension-Key': creds.apiKey }
        });
        console.log(`[BidDetailTrace] start response status: ${res.status}`);
        if (!res.ok) {
            console.error(`[BidDetailTrace] final error: Start failed HTTP ${res.status}`);
        }
        return res.ok;
    } catch (e) {
        console.error(`[BidDetailTrace] final error: ${e.message}`);
        return false;
    }
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
