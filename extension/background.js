import { initializeJobManager, resumeManualJob, getState } from './core/job-manager.js';

initializeJobManager();

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "start_polling") {
        initializeJobManager();
        sendResponse({ started: true });
    } else if (request.action === "resume_manual") {
        resumeManualJob();
        sendResponse({ resumed: true });
    } else if (request.action === "get_status") {
        getState().then(job => sendResponse({ job })).catch(e => sendResponse({ job: null }));
        return true;
    }
});
