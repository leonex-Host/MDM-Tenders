import { fetchJobs, startJobOnServer, completeJobOnServer, uploadResults } from '../api/backend-client.js';
import { runWorkflow } from './workflow-engine.js';

let isProcessing = false;

let pollerInterval = null;

export async function initializeJobManager() {
    chrome.alarms.create("pollJobs", { periodInMinutes: 1 });
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === "pollJobs") pollAndProcess();
    });

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
    isProcessing = true;
    try {
        await processJobLogic();
    } finally {
        isProcessing = false;
    }
}

export async function resumeManualJob() { // called from popup
    const job = await getState();
    if (job && job.status === 'manual_action_required') {
        await updateJobState({ status: 'running', manualReason: null });
        pollAndProcess();
    }
}

async function processJobLogic() {
    let job = await getState();

    if (job) {
        if (job.status === 'manual_action_required') {
            console.log("Job paused for manual action. Use popup to resume.");
            return;
        }
        console.log("Resuming active job:", job.job_id);
    } else {
        const data = await fetchJobs();
        let fetchedList = [];
        if (Array.isArray(data)) fetchedList = data;
        else if (data && Array.isArray(data.jobs)) fetchedList = data.jobs;

        if (fetchedList.length > 0) {
            job = fetchedList[0];
            console.log("Locking new job:", job.job_id);
            const locked = await startJobOnServer(job.job_id || job.id);
            if (!locked) return; // Could not lock or server rejected

            job.status = 'running';
            job.phase = 'init';
            job.currentKeywordIndex = 0;
            job.resultsCollected = 0;
            job.uploadedResults = 0;
            job.allResultsPhase1 = [];
            job.uploadQueue = [];

            await chrome.storage.local.set({ activeJob: job });
        } else {
            return; // No jobs
        }
    }

    try {
        await processUploadQueue();
        await runWorkflow(job);
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
    await updateJobState({ status: 'manual_action_required', manualReason: reason, pausedUrl: url });
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
