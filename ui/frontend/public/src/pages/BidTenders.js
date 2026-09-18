// ============================================
// LEONEX TENDER — BidDetail.com Tender List
// All data fetched from FastAPI backend
// ============================================
import { renderSourcePage } from './SourcePage.js';

export async function renderBidTenders(container) {
    await renderSourcePage(container, {
        source:      'biddetail',
        name:        'BidDetail Tenders',
        icon:        'file-text',
        description: 'Aggregated tender listings from BidDetail.com — MDM & Data Governance focused',
    });
}
