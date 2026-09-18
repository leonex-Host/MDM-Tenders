import { runGoogleWorkflow } from '../workflows/google-workflow.js';
import { runTendersOnTimeWorkflow } from '../workflows/tendersontime-workflow.js';
import { runTender247Workflow } from '../workflows/tender247-workflow.js';
import { runBidDetailWorkflow } from '../workflows/biddetail-workflow.js';
import { runTenderDetailWorkflow } from '../workflows/tenderdetail-workflow.js';
import { runGemWorkflow } from '../workflows/gem-workflow.js';
import { failJob } from './job-manager.js';

export async function runWorkflow(job) {
    const source = (job.source || "tenderontime").toLowerCase();

    switch (source) {
        case 'google':
            await runGoogleWorkflow(job);
            break;
        case 'tenderontime':
            await runTendersOnTimeWorkflow(job);
            break;
        case 'tender247':
            await runTender247Workflow(job);
            break;
        case 'biddetail':
            await runBidDetailWorkflow(job);
            break;
        case 'tenderdetail':
            await runTenderDetailWorkflow(job);
            break;
        case 'gem':
            await runGemWorkflow(job);
            break;
        default:
            console.error("Unsupported source:", source);
            await failJob(`Unsupported workflow source: ${source}`);
            break;
    }
}
