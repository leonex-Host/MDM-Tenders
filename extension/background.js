import { initializeJobManager, resumeManualJob, getState, pollAndProcess, failJob } from './core/job-manager.js';
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
        ensurePollingAlarm();
        initializeJobManager();
        sendResponse({ started: true });
    } else if (request.action === "resume_manual") {
        resumeManualJob();
        sendResponse({ resumed: true });
    } else if (request.action === "abort_manual") {
        getState().then(async (job) => {
            if (job) {
                if (job.windowId) {
                    await closeJobTab(job.windowId).catch(() => { });
                }
                await failJob("Aborted manually by operator on local laptop");
                chrome.runtime.reload();
            }
        });
        sendResponse({ aborted: true });
    } else if (request.action === "get_status") {
        getState().then(job => sendResponse({ job })).catch(e => sendResponse({ job: null }));
        return true;
    }
});
