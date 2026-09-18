export function detectChallenge(title, html, text, url) {
    const lowerText = text.toLowerCase();

    const cloudflareActive =
        /just a moment|checking your browser|verify you are human/i.test(title + " " + lowerText) ||
        html.includes("cf-turnstile") ||
        html.includes("cf-chl") ||
        html.includes("challenge-platform");

    const accessDenied = /access denied|attention required/i.test(title + " " + lowerText);
    const captcha = /captcha/i.test(title + " " + lowerText);

    if (cloudflareActive) return { isChallenge: true, type: 'cloudflare', reason: 'Cloudflare detected' };
    if (accessDenied) return { isChallenge: true, type: 'access_denied', reason: 'Access Denied detected' };
    if (captcha) return { isChallenge: true, type: 'captcha', reason: 'CAPTCHA detected' };

    return { isChallenge: false };
}
