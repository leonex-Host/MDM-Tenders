import { renderSourcePage } from './SourcePage.js';

export async function renderGEMPortal(container) {
    await renderSourcePage(container, {
        source:      'gem',
        name:        'GEM Portal',
        icon:        'gem',
        description: 'Government e-Marketplace — The National Public Procurement Portal',
    });
}
