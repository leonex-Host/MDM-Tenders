import { fetchJobs, startJobOnServer, completeJobOnServer, uploadResults } from '../api/backend-client.js';
import { runWorkflow } from './workflow-engine.js';

let isProcessing = false;
let pollerInterval = null;

export async function getExtensionState() {
    const data = await chrome.storage.local.get(['extensionState']);
    return data.extensionState || { blocked: false, blockReason: null, lastError: null };
}

export async function setExtensionState(updates) {
    const state = await getExtensionState();
    const newState = { ...state, ...updates };
    await chrome.storage.local.set({ extensionState: newState });
    return newState;
}

export function validateExtensionJob(rawJob) {
    if (!rawJob || typeof rawJob !== "object" || Array.isArray(rawJob)) {
        return { valid: false, reason: "job is missing or is not an object" };
    }

    const jobId = String(rawJob.job_id ?? "").trim();
    const source = String(rawJob.source ?? rawJob.source_name ?? rawJob.sourceName ?? "").trim().toLowerCase();

    // In our existing implementation, the target URL is implicit for TenderOnTime/Google, 
    // but the backend sends generic fields. We will tolerate an implicit URL if it's a known generic source, 
    // but fail if the explicit validation logic determines targetUrl is strictly needed strings.
    // The user suggested explicit target_url check. I will include a basic check, bypassing if keywords exist.
    const rawTargetUrl = String(rawJob.target_url ?? rawJob.targetUrl ?? rawJob.url ?? rawJob.detail_url ?? rawJob.detailUrl ?? "").trim();

    if (!jobId) return { valid: false, reason: "missing job_id" };
    if (!source) return { valid: false, reason: "missing source" };

    if (rawTargetUrl && (rawTargetUrl === "undefined" || rawTargetUrl === "null" || rawTargetUrl === "[object Object]")) {
        return { valid: false, reason: "target URL contains an invalid placeholder" };
    }

    let parsedUrl = null;
    if (rawTargetUrl) {
        try {
            parsedUrl = new URL(rawTargetUrl);
            if (!["http:", "https:"].includes(parsedUrl.protocol)) {
                return { valid: false, reason: "target URL does not use HTTP or HTTPS" };
            }
        } catch {
            return { valid: false, reason: "target URL is not a valid absolute URL" };
        }
    }

    return {
        valid: true,
        job: { ...rawJob, job_id: jobId, source, target_url: parsedUrl ? parsedUrl.toString() : null }
    };
}

export async function initializeJobManager() {
    if (!pollerInterval) {
        pollerInterval = setInterval(() => {
            pollAndProcess();
        }, 5000); // Aggressively poll every 5s while service worker is alive
    }

    // Attempt recovery on boot
    pollAndProcess();
}

export async function getState() {
    const data = await chrome.storage.local.get(['activeJob']);
    return data.activeJob || null;
}

export async function pollAndProcess() {
    if (isProcessing) return;
    const extState = await getExtensionState();
    if (extState.blocked) return;

    isProcessing = true;
    try {
        await processJobLogic();
    } finally {
        isProcessing = false;
    }
}

export async function resumeManualJob() { // called from popup
    await setExtensionState({ blocked: false, blockReason: null, lastError: null });
    pollAndProcess();
}

async function processJobLogic() {
    let rawJob = await getState();

    if (rawJob) {
        if (!rawJob.job_id && !rawJob.source) {
            console.error("Corrupted activeJob detected. Purging state.");
            await chrome.storage.local.remove(['activeJob']);
            rawJob = null;
        } else {
            console.log("Resuming active job:", rawJob.job_id);
        }
    }

    if (!rawJob) {
        const data = await fetchJobs();
        let fetchedList = [];
        if (Array.isArray(data)) fetchedList = data;
        else if (data && Array.isArray(data.jobs)) fetchedList = data.jobs;

        if (fetchedList.length > 0) {
            rawJob = fetchedList[0];
            const validation = validateExtensionJob(rawJob);
            if (!validation.valid) {
                console.error("[JobManager] Invalid job rejected:", validation.reason, rawJob);
                await setExtensionState({ lastJobError: { reason: validation.reason, timestamp: Date.now() } });
                return;
            }

            const job = validation.job;
            console.log("[BidDetailTrace] valid job accepted:", { job_id: job.job_id, source: job.source });

            console.log("Locking new job:", job.job_id);
            const locked = await startJobOnServer(job.job_id);
            if (!locked) return; // Could not lock or server rejected

            job.status = 'running';
            job.phase = 'search';
            job.currentKeywordIndex = 0;
            job.resultsCollected = 0;
            job.uploadedResults = 0;
            job.allResultsPhase1 = [];
            job.uploadQueue = [];

            await chrome.storage.local.set({ activeJob: job });
            rawJob = job;
        } else {
            return; // No jobs
        }
    }

    const currentValidation = validateExtensionJob(rawJob);
    if (!currentValidation.valid) {
        await chrome.storage.local.remove(['activeJob']);
        return;
    }

    try {
        await processUploadQueue();
        await runWorkflow(currentValidation.job);
    } catch (e) {
        console.error("Workflow fatal error", e);
        if (e.message !== "CHALLENGE_PAUSED") {
            await failJob(e.message || "Unknown error");
        }
    }
}

export async function updateJobState(updates) {
    const job = await getState() || {};
    const newState = { ...job, ...updates };
    await chrome.storage.local.set({ activeJob: newState });
    return newState;
}

export async function setManualActionRequired(reason, url) {
    await setExtensionState({ blocked: true, blockReason: reason, pausedUrl: url });
}

export async function finishJob(matches = 0, summaryData = {}) {
    await processUploadQueue(); // Ensure queue is flushed completely
    const job = await getState();
    if (!job) return;
    if (job.uploadQueue && job.uploadQueue.length > 0) {
        console.warn("Cannot finish job yet, uploads pending. Will retry next tick.");
        return;
    }
    await completeJobOnServer(job.job_id || job.id, { status: "completed", summary: { total_matches: matches, ...summaryData } });
    await chrome.storage.local.remove(['activeJob']);
}

export async function failJob(errorMsg) {
    const job = await getState();
    if (!job) return;
    await completeJobOnServer(job.job_id || job.id, { status: "failed", error: errorMsg });
    await chrome.storage.local.remove(['activeJob']);
}

export async function enqueueUpload(payload) {
    const job = await getState();
    if (!job) return;
    job.uploadQueue = job.uploadQueue || [];
    const batchId = Date.now().toString() + Math.random().toString();
    job.uploadQueue.push({ batchId, payload });
    await updateJobState({ uploadQueue: job.uploadQueue });
    await processUploadQueue();
}

let isUploading = false;
export async function processUploadQueue() {
    if (isUploading) return;
    isUploading = true;
    try {
        let job = await getState();
        if (!job || !job.uploadQueue || job.uploadQueue.length === 0) return;

        let remainingQueue = [...job.uploadQueue];
        for (const batch of job.uploadQueue) {
            if (batch.status && ['validation_error', 'fatal', 'payload_too_large'].includes(batch.status)) {
                break; // blocked by permanent failure
            }

            const res = await uploadResults(batch.payload);

            if (res.ok) {
                remainingQueue.shift();
                await updateJobState({ uploadQueue: remainingQueue });
            } else if ([400, 422].includes(res.status)) {
                batch.status = 'validation_error';
                batch.lastResponse = res.status;
                await updateJobState({ uploadQueue: remainingQueue });
                console.error(`Permanent ${res.status}, preserving payload for manual recovery.`);
                break;
            } else if ([401, 403, 404].includes(res.status)) {
                batch.status = 'fatal';
                batch.lastResponse = res.status;
                await updateJobState({ uploadQueue: remainingQueue });
                console.error(`Fatal Auth/Not Found ${res.status}, locking queue.`);
                break;
            } else if (res.status === 413) {
                batch.status = 'payload_too_large';
                batch.lastResponse = res.status;
                await updateJobState({ uploadQueue: remainingQueue });
                break;
            } else if (res.status === 409) {
                console.warn("409 Conflict - treating as already processed");
                remainingQueue.shift();
                await updateJobState({ uploadQueue: remainingQueue });
            } else {
                console.error(`Upload network/5xx error (status ${res.status}), keeping in queue for retry.`);
                break;
            }
        }
    } finally {
        isUploading = false;
    }
}
