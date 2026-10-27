import { WhitelabelConfig, FlatPostMessageEventType } from '@flat/shared';

export function parseHexToRgb(hex: string): [number, number, number] {
    let cleanHex = hex.replace('#', '').trim();
    if (cleanHex.length === 3) {
        cleanHex = cleanHex.split('').map(c => c + c).join('');
    }
    const num = parseInt(cleanHex, 16);
    if (isNaN(num) || cleanHex.length !== 6) {
        return [245, 158, 11]; // default amber #f59e0b
    }
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function parseWhitelabelFromUrl(searchString?: string): WhitelabelConfig {
    const search = searchString !== undefined ? searchString : (typeof window !== 'undefined' ? window.location.search : '');
    const params = new URLSearchParams(search);

    const parseBool = (val: string | null, defaultVal: boolean): boolean => {
        if (val === null) return defaultVal;
        const normalized = val.toLowerCase().trim();
        return normalized === 'true' || normalized === '1' || normalized === 'yes';
    };

    let rawColor = params.get('color') || params.get('primaryColor') || '#f59e0b';
    if (rawColor && !rawColor.startsWith('#')) {
        rawColor = `#${rawColor}`;
    }

    const theme = (params.get('theme') === 'light' ? 'light' : 'dark') as 'dark' | 'light';

    return {
        brandName: params.get('brand') || params.get('brandName') || 'FlatBuilder',
        brandSubtitle: params.get('subtitle') || params.get('brandSubtitle') || '3D Interactive Planner',
        brandLogo: params.get('logo') || params.get('brandLogo') || undefined,
        primaryColor: rawColor,
        theme,
        hideBranding: parseBool(params.get('hideBranding') || params.get('whitelabel'), false),
        contactPhone: params.get('phone') || params.get('contactPhone') || undefined,
        ctaText: params.get('cta') || params.get('ctaText') || 'Оставить заявку',
        webhookUrl: params.get('webhook') || params.get('webhookUrl') || undefined,
        features: {
            atmosphere: parseBool(params.get('atmosphere'), true),
            passport: parseBool(params.get('passport'), true),
            materials: parseBool(params.get('materials'), true),
            aiRender: parseBool(params.get('aiRender'), true),
            furniture: parseBool(params.get('furniture'), true),
            apartmentPicker: parseBool(params.get('apartmentPicker'), true),
            bake: parseBool(params.get('bake'), false),
            share: parseBool(params.get('share'), true),
        }
    };
}

export function applyWhitelabelTheme(config: WhitelabelConfig) {
    if (typeof document === 'undefined') return;

    const primaryColor = config.primaryColor || '#f59e0b';
    const [r, g, b] = parseHexToRgb(primaryColor);

    // Darken slightly for hover
    const hoverR = Math.max(0, Math.round(r * 0.85));
    const hoverG = Math.max(0, Math.round(g * 0.85));
    const hoverB = Math.max(0, Math.round(b * 0.85));
    const hoverHex = `#${((1 << 24) + (hoverR << 16) + (hoverG << 8) + hoverB).toString(16).slice(1)}`;

    const root = document.documentElement;
    root.style.setProperty('--flat-primary', primaryColor);
    root.style.setProperty('--flat-primary-hover', hoverHex);
    root.style.setProperty('--flat-primary-rgb', `${r}, ${g}, ${b}`);

    if (config.theme === 'light') {
        root.classList.remove('dark');
        root.classList.add('light');
    } else {
        root.classList.remove('light');
        root.classList.add('dark');
    }
}

/**
 * Dispatches an event to the embedding parent window via window.postMessage
 */
export function emitHostEvent(type: FlatPostMessageEventType, payload?: any) {
    if (typeof window === 'undefined') return;

    const message = {
        source: 'flat-builder',
        type,
        payload,
        timestamp: Date.now()
    };

    // If running in an iframe
    if (window.parent && window.parent !== window) {
        window.parent.postMessage(message, '*');
    }

    // Also dispatch on window for local scripts/listeners
    window.dispatchEvent(new CustomEvent(type, { detail: payload }));
}
