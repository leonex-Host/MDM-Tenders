import { renderSourcePage } from './SourcePage.js';

export async function renderTenderOnTime(container) {
    await renderSourcePage(container, {
        source:      'tenderontime',
        name:        'TenderOnTime',
        icon:        'clock',
        description: 'Global Tenders, E-Procurement, and Bidding Projects',
    });
}
