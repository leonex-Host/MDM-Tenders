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

chrome.tabs.onRemoved.addListener(async (tabId) => {
    const jobIds = getAllActiveJobIds();
    for (const jid of jobIds) {
        const rt = getRuntime(jid);
        if (rt && rt.tabId === tabId) {
            console.warn(`[SyncTrace] Tab closed for job ${jid}. Terminating automatically.`);
            await failJob(jid, "Browser tab running sequence was unexpectedly closed by operator");
        }
    }
});

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
            sendResponse({ aborted: true });
            setTimeout(() => { chrome.runtime.reload(); }, 200);
        })();
        return true;
    } else if (request.action === "abort_job") {
        (async () => {
            if (request.jobId) {
                await failJob(request.jobId, "Aborted target job manually from local component terminal");
            }
            sendResponse({ aborted: true });
        })();
        return true;
    } else if (request.action === "get_status") {
        const jobIds = getAllActiveJobIds();
        const jobs = [];
        for (const jid of jobIds) {
            const rt = getRuntime(jid);
            if (rt) {
                jobs.push({
                    job_id: rt.jobId,
                    source: rt.jobType || rt.source || 'unknown',
                    status: rt.status,
                    phase: rt.phase || 'unknown',
                    results: rt.resultsCollected || 0,
                    inserted: rt.tenders_inserted || 0,
                    duplicates: rt.tenders_duplicates || 0,
                    total_keywords: rt.keywords ? rt.keywords.length : 0,
                    current_keyword_index: (rt.currentKeywordIndex || 0) + 1,
                    keyword: (rt.keywords && rt.keywords.length > 0) ? rt.keywords[rt.currentKeywordIndex || 0] : null
                });
            }
        }
        sendResponse({ jobs, count: jobs.length });
        return false;
    } else if (request.action === "abort_job") {
        failJob(request.jobId, "Aborted manually by operator").then(() => {
            sendResponse({ aborted: true });
        });
        return true;
    } else if (request.action === "keep_alive") {
        sendResponse({ ok: true });
        return false;
    } else if (request.action === "trigger_poll") {
        pollAndProcess();
        sendResponse({ ok: true });
        return false;
    }
});
