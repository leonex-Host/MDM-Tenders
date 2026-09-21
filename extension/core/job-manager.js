import { fetchJobs, startJobOnServer, completeJobOnServer, uploadResults } from '../api/backend-client.js';
import { runWorkflow } from './workflow-engine.js';
import { closeJobTab } from './tab-manager.js';

let pollingInProgress = false;
let pollerInterval = null;
let isInitialized = false;
const MAX_CONCURRENT_JOBS = 6;
const STALE_TIMEOUT_MS = 300000; // 5 minutes

// In memory Map for active rutimes
const activeJobs = new Map();

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
    if (isInitialized) return;
    isInitialized = true;

    if (!pollerInterval) {
        pollerInterval = setInterval(() => {
            pollAndProcess();
            checkStaleJobs();
        }, 5000);
    }

    // Recovery of local storage jobs on boot
    const data = await chrome.storage.local.get(['activeJobsSync']);
    if (data.activeJobsSync) {
        for (const [jobId, runtime] of Object.entries(data.activeJobsSync)) {
            activeJobs.set(jobId, runtime);
            if (runtime.status === 'running') {
                // Resume background loops organically directly natively
                runWorkflowWrapper(runtime);
            }
        }
    }
    pollAndProcess();
}

async function syncMapToStorage() {
    // Basic sync logic to ensure MV3 persistence survives organic teardowns
    const raw = {};
    let firstJob = null;
    for (const [key, val] of activeJobs.entries()) {
        raw[key] = val;
        if (!firstJob) {
            firstJob = {
                job_id: val.jobId,
                source: val.jobType,
                phase: val.phase,
                status: val.status,
                keyword: (val.keywords && val.keywords[val.keywordIndex]) || null,
                allResultsPhase1: val.allResultsPhase1 || [],
                tabId: val.tabId
            };
        }
    }
    await chrome.storage.local.set({ activeJobsSync: raw, activeJob: firstJob });
}

export function getRuntime(jobId) {
    return activeJobs.get(jobId) || null;
}

// Bridge: returns the first active runtime (backward compat for popup UI)
export function getActiveJobSummary() {
    for (const [jobId, runtime] of activeJobs.entries()) {
        return {
            job_id: runtime.jobId,
            source: runtime.jobType,
            phase: runtime.phase,
            status: runtime.status,
            keyword: (runtime.keywords && runtime.keywords[runtime.keywordIndex]) || null,
            allResultsPhase1: runtime.allResultsPhase1 || [],
            tabId: runtime.tabId
        };
    }
    return null;
}

// Returns all active job IDs for batch operations
export function getAllActiveJobIds() {
    return Array.from(activeJobs.keys());
}

export async function pollAndProcess() {
    if (pollingInProgress) return;
    const extState = await getExtensionState();
    if (extState.blocked) return;

    if (activeJobs.size >= MAX_CONCURRENT_JOBS) {
        console.log(`[AGENT][POLL] Capacity reached (${activeJobs.size}/${MAX_CONCURRENT_JOBS}). Waiting.`);
        return;
    }

    pollingInProgress = true;
    try {
        await processJobLogic();
    } finally {
        pollingInProgress = false;
    }
}

export async function resumeManualJob() {
    console.log("[AGENT] Resuming global block...");
    await setExtensionState({ blocked: false, blockReason: null, lastError: null });

    // Resurrect dead workflow threads natively
    for (const [id, rt] of activeJobs.entries()) {
        if (rt.status === 'paused') {
            console.log(`[JOB][${id}] Restarting paused workflow loop...`);
            await updateRuntimeState(id, { status: 'running' });
            runWorkflowWrapper(rt);
        }
    }

    pollAndProcess();
}

async function processJobLogic() {
    let slotsAvailable = MAX_CONCURRENT_JOBS - activeJobs.size;
    if (slotsAvailable <= 0) return;

    const fetchedRaw = await fetchJobs();
    let fetchedList = [];
    if (Array.isArray(fetchedRaw)) fetchedList = fetchedRaw;
    else if (fetchedRaw && Array.isArray(fetchedRaw.jobs)) fetchedList = fetchedRaw.jobs;

    if (fetchedList.length === 0) return;

    console.log(`[AGENT][POLL] Received ${fetchedList.length} jobs.`);

    for (const rawJob of fetchedList) {
        if (slotsAvailable <= 0) break;

        const validation = validateExtensionJob(rawJob);
        if (!validation.valid) continue;

        const job = validation.job;
        if (activeJobs.has(job.job_id)) continue; // Already mapped natively

        console.log(`[JOB][${job.job_id}] Locking new job`);
        const locked = await startJobOnServer(job.job_id);
        if (!locked) continue;

        const runtime = {
            jobId: job.job_id,
            jobType: job.source,
            tabId: null,
            status: 'running',
            phase: 'search',
            keywordIndex: 0,
            resultsCollected: 0,
            uploadedResults: 0,
            allResultsPhase1: [],
            uploadQueue: [],

            // Raw properties needed by workflows inherently
            keywords: job.keywords || [],
            max_pages: job.max_pages || 5,

            startedAt: Date.now(),
            lastActivityAt: Date.now(),
            pausedUrl: null,
            error: null
        };

        activeJobs.set(runtime.jobId, runtime);
        await syncMapToStorage();
        slotsAvailable--;

        console.log(`[JOB][${runtime.jobId}] starting ${runtime.jobType.toUpperCase()}`);
        runWorkflowWrapper(runtime);
    }
}

async function runWorkflowWrapper(runtime) {
    try {
        await processUploadQueue(runtime.jobId);
        await runWorkflow(runtime);
    } catch (e) {
        console.error(`[JOB][${runtime.jobId}] Workflow fatal error`, e);
        if (e.message !== "CHALLENGE_PAUSED") {
            await failJob(runtime.jobId, e.message || "Unknown error");
        }
    }
}

export async function updateRuntimeState(jobId, updates) {
    const runtime = activeJobs.get(jobId);
    if (!runtime) return null;

    for (const key of Object.keys(updates)) {
        runtime[key] = updates[key];
    }
    runtime.lastActivityAt = Date.now();

    // Save map dynamically organically 
    await syncMapToStorage();
    return runtime;
}

export async function setManualActionRequired(jobId, reason, url) {
    console.warn(`[JOB][${jobId}] paused manually: ${reason}`);
    await updateRuntimeState(jobId, { pausedUrl: url, status: 'paused', error: reason });
    await setExtensionState({ blocked: true, blockReason: reason });
}

export async function finishJob(jobId, matches = 0, summaryData = {}) {
    const runtime = activeJobs.get(jobId);
    if (!runtime) return;

    await processUploadQueue(jobId);

    if (runtime.uploadQueue && runtime.uploadQueue.length > 0) {
        console.warn(`[JOB][${jobId}] Cannot finish job yet, uploads pending.`);
        runtime.lastActivityAt = Date.now();
        return; // Will retry via heartbeat organically 
    }

    console.log(`[JOB][${jobId}] completed natively. Matched: ${matches}`);
    await completeJobOnServer(jobId, { status: "completed", summary: { total_matches: matches, ...summaryData } });

    activeJobs.delete(jobId);
    if (runtime.tabId) await closeJobTab(runtime.tabId);
    await syncMapToStorage();
}

export async function failJob(jobId, errorMsg) {
    const runtime = activeJobs.get(jobId);
    if (!runtime) return;

    console.error(`[JOB][${jobId}] FAILED: ${errorMsg}`);
    await completeJobOnServer(jobId, { status: "failed", error: errorMsg });

    activeJobs.delete(jobId);
    if (runtime.tabId) await closeJobTab(runtime.tabId);
    await syncMapToStorage();
}

export async function enqueueUpload(jobId, payload) {
    const runtime = activeJobs.get(jobId);
    if (!runtime) return;

    runtime.uploadQueue = runtime.uploadQueue || [];
    const batchId = Date.now().toString() + Math.random().toString();
    runtime.uploadQueue.push({ batchId, payload });
    await updateRuntimeState(jobId, { uploadQueue: runtime.uploadQueue });
    await processUploadQueue(jobId);
}

// Ensure uploading isn't globally locked blocking other jobs!
const uploadingJobs = new Set();
export async function processUploadQueue(jobId) {
    if (uploadingJobs.has(jobId)) return;
    uploadingJobs.add(jobId);

    try {
        let runtime = activeJobs.get(jobId);
        if (!runtime || !runtime.uploadQueue || runtime.uploadQueue.length === 0) return;

        let remainingQueue = [...runtime.uploadQueue];
        for (const batch of runtime.uploadQueue) {
            if (batch.status && ['validation_error', 'fatal', 'payload_too_large'].includes(batch.status)) break;

            const res = await uploadResults(batch.payload);
            runtime.lastActivityAt = Date.now(); // bump heartbeat

            if (res.ok) {
                remainingQueue.shift();
                await updateRuntimeState(jobId, { uploadQueue: remainingQueue });
            } else if ([400, 422].includes(res.status)) {
                batch.status = 'validation_error';
                await updateRuntimeState(jobId, { uploadQueue: remainingQueue });
                console.error(`[JOB][${jobId}] upload permanent generic ${res.status}`);
                break;
            } else if ([401, 403, 404].includes(res.status)) {
                batch.status = 'fatal';
                await updateRuntimeState(jobId, { uploadQueue: remainingQueue });
                console.error(`[JOB][${jobId}] Fatal Auth ${res.status}`);
                break;
            } else if (res.status === 413) {
                batch.status = 'payload_too_large';
                await updateRuntimeState(jobId, { uploadQueue: remainingQueue });
                break;
            } else if (res.status === 409) {
                remainingQueue.shift();
                await updateRuntimeState(jobId, { uploadQueue: remainingQueue });
            } else {
                break;
            }
        }
    } finally {
        uploadingJobs.delete(jobId);
    }
}

async function checkStaleJobs() {
    const now = Date.now();
    for (const [jobId, runtime] of activeJobs.entries()) {
        if (runtime.status === 'paused') continue;

        if (now - runtime.lastActivityAt > STALE_TIMEOUT_MS) {
            console.error(`[JOB][${jobId}] Stale timeout detected organically. Last activity was >5m ago.`);
            // if queue is failing, finishJob might be pending perpetually
            if (runtime.uploadQueue && runtime.uploadQueue.length > 0) {
                console.log(`[JOB][${jobId}] Upload queue frozen. Purging job to recycle thread boundaries.`);
                await failJob(jobId, "Upload sequence stalled perpetually timeout");
            } else {
                await failJob(jobId, "Job timed out organically (no heartbeat)");
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────
// Tab mapping hooks required inherently for closed tabs extraction
// ─────────────────────────────────────────────────────────────────
chrome.tabs.onRemoved.addListener(async (closedTabId) => {
    for (const [jobId, runtime] of activeJobs.entries()) {
        if (runtime.tabId === closedTabId) {
            console.warn(`[TAB][${jobId}] Tab ${closedTabId} organically destroyed by native OS forces external.`);
            await failJob(jobId, "Browser tab structurally destroyed externally");
        }
    }
});
