import { renderSourcePage } from './SourcePage.js';

export async function renderTenderDetailPage(container) {
    await renderSourcePage(container, {
        source:      'tenderdetail',
        name:        'TenderDetail',
        icon:        'file-search',
        description: 'Comprehensive Indian & Global Tender Information',
    });
}
