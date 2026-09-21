import { initializeJobManager, resumeManualJob, getRuntime, getAllActiveJobIds, pollAndProcess, failJob } from './core/job-manager.js';
import { closeJobTab } from './core/tab-manager.js';

const POLL_ALARM_NAME = "extension-job-poll";

async function ensurePollingAlarm() {
    await chrome.alarms.clear(POLL_ALARM_NAME);
    await chrome.alarms.create(POLL_ALARM_NAME, { periodInMinutes: 1 });
}

chrome.runtime.onStartup.addListener(() => {
    ensurePollingAlarm().catch((error) => console.error("[Polling] startup alarm error:", error));
    pollAndProcess();
});

chrome.runtime.onInstalled.addListener(() => {
    ensurePollingAlarm().catch((error) => console.error("[Polling] install alarm error:", error));
    pollAndProcess();
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === POLL_ALARM_NAME) {
        pollAndProcess().catch((error) => console.error("[Polling] alarm poll error:", error));
    }
});

initializeJobManager();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "start_polling") {
        chrome.storage.local.get(['extensionState']).then(async data => {
            if (data.extensionState) {
                await chrome.storage.local.set({ extensionState: { ...data.extensionState, blocked: false, blockReason: null } });
            }
            ensurePollingAlarm();
            initializeJobManager();
            sendResponse({ started: true });
        });
        return true;
    } else if (request.action === "resume_manual") {
        resumeManualJob();
        sendResponse({ resumed: true });
    } else if (request.action === "abort_manual") {
        (async () => {
            const jobIds = getAllActiveJobIds();
            for (const jid of jobIds) {
                await failJob(jid, "Aborted manually by operator on local laptop");
            }
            chrome.runtime.reload();
        })();
        sendResponse({ aborted: true });
    } else if (request.action === "get_status") {
        const jobIds = getAllActiveJobIds();
        const jobs = [];
        for (const jid of jobIds) {
            const rt = getRuntime(jid);
            if (rt) jobs.push({ job_id: rt.jobId, source: rt.jobType || rt.source || 'unknown', status: rt.status });
        }
        sendResponse({ jobs, count: jobs.length });
        return false;
    } else if (request.action === "keep_alive") {
        sendResponse({ ok: true });
        return false;
    } else if (request.action === "trigger_poll") {
        pollAndProcess();
        sendResponse({ ok: true });
        return false;
    }
});
