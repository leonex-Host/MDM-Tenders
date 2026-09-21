import { runGoogleWorkflow } from '../workflows/google-workflow.js';
import { runTendersOnTimeWorkflow } from '../workflows/tendersontime-workflow.js';
import { runTender247Workflow } from '../workflows/tender247-workflow.js';
import { runBidDetailWorkflow } from '../workflows/biddetail-workflow.js';
import { runTenderDetailWorkflow } from '../workflows/tenderdetail-workflow.js';
import { runGemWorkflow } from '../workflows/gem-workflow.js';
import { failJob } from './job-manager.js';

export async function runWorkflow(runtime) {
    const source = (runtime.jobType || runtime.source || "tenderontime").toLowerCase();

    switch (source) {
        case 'google':
            await runGoogleWorkflow(runtime);
            break;
        case 'tenderontime':
            await runTendersOnTimeWorkflow(runtime);
            break;
        case 'tender247':
            await runTender247Workflow(runtime);
            break;
        case 'biddetail':
            await runBidDetailWorkflow(runtime);
            break;
        case 'tenderdetail':
            await runTenderDetailWorkflow(runtime);
            break;
        case 'gem':
            await runGemWorkflow(runtime);
            break;
        default:
            console.error(`[JOB][${runtime.jobId}] Unsupported source:`, source);
            await failJob(runtime.jobId, `Unsupported workflow source: ${source}`);
            break;
    }
}
