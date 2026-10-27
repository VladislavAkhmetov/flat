/**
 * FlatBuilder Embed SDK v1.0 (Standalone Drop-in Script)
 * 
 * Usage:
 * <div data-flat-widget
 *      data-scene="euro2"
 *      data-brand="ЖК Горизонт"
 *      data-color="#10b981"
 *      data-theme="dark"
 *      style="width: 100%; height: 700px;">
 * </div>
 * <script src="https://widget-url/embed.js" async></script>
 */
(function (window, document) {
    'use strict';

    // Find script origin to determine widget base URL
    var currentScript = document.currentScript || (function () {
        var scripts = document.getElementsByTagName('script');
        for (var i = scripts.length - 1; i >= 0; i--) {
            if (scripts[i].src && scripts[i].src.indexOf('embed.js') !== -1) {
                return scripts[i];
            }
        }
        return null;
    })();

    var defaultBaseUrl = currentScript && currentScript.src
        ? currentScript.src.replace(/\/embed\.js(\?.*)?$/, '')
        : (window.location.origin || 'http://localhost:5173');

    var eventListeners = {};

    var FlatBuilder = {
        version: '1.0.0',
        baseUrl: defaultBaseUrl,

        /**
         * Register event listener for widget events
         * @param {string} event - e.g. 'ready', 'lead_submitted', 'apartment_changed'
         * @param {function} callback
         */
        on: function (event, callback) {
            var fullEvent = event.indexOf('flat:') === 0 ? event : 'flat:' + event;
            if (!eventListeners[fullEvent]) {
                eventListeners[fullEvent] = [];
            }
            eventListeners[fullEvent].push(callback);
        },

        /**
         * Send command to a specific widget iframe
         * @param {HTMLIFrameElement} iframe
         * @param {string} command - e.g. 'flat:set_apartment', 'flat:set_theme'
         * @param {object} payload
         */
        send: function (iframe, command, payload) {
            if (iframe && iframe.contentWindow) {
                var fullCmd = command.indexOf('flat:') === 0 ? command : 'flat:' + command;
                iframe.contentWindow.postMessage({
                    type: fullCmd,
                    payload: payload || {}
                }, '*');
            }
        },

        /**
         * Programmatically create a widget instance inside container
         * @param {string|HTMLElement} target
         * @param {object} options
         */
        init: function (target, options) {
            var el = typeof target === 'string' ? document.querySelector(target) : target;
            if (!el) {
                console.warn('[FlatBuilder] Target element not found:', target);
                return null;
            }

            options = options || {};
            var baseUrl = options.baseUrl || FlatBuilder.baseUrl;
            var clientUrl = baseUrl + '/client.html';

            var queryParams = [];
            if (options.scene || options.preset || options.s) {
                queryParams.push('s=' + encodeURIComponent(options.scene || options.preset || options.s));
            }
            if (options.brand || options.brandName) {
                queryParams.push('brand=' + encodeURIComponent(options.brand || options.brandName));
            }
            if (options.subtitle || options.brandSubtitle) {
                queryParams.push('subtitle=' + encodeURIComponent(options.subtitle || options.brandSubtitle));
            }
            if (options.color || options.primaryColor) {
                queryParams.push('color=' + encodeURIComponent(options.color || options.primaryColor));
            }
            if (options.theme) {
                queryParams.push('theme=' + encodeURIComponent(options.theme));
            }
            if (options.logo || options.brandLogo) {
                queryParams.push('logo=' + encodeURIComponent(options.logo || options.brandLogo));
            }
            if (options.phone || options.contactPhone) {
                queryParams.push('phone=' + encodeURIComponent(options.phone || options.contactPhone));
            }
            if (options.cta || options.ctaText) {
                queryParams.push('cta=' + encodeURIComponent(options.cta || options.ctaText));
            }
            if (options.webhook || options.webhookUrl) {
                queryParams.push('webhook=' + encodeURIComponent(options.webhook || options.webhookUrl));
            }
            if (options.hideBranding !== undefined) {
                queryParams.push('hideBranding=' + (options.hideBranding ? '1' : '0'));
            }
            if (options.atmosphere !== undefined) {
                queryParams.push('atmosphere=' + (options.atmosphere ? '1' : '0'));
            }
            if (options.passport !== undefined) {
                queryParams.push('passport=' + (options.passport ? '1' : '0'));
            }
            if (options.materials !== undefined) {
                queryParams.push('materials=' + (options.materials ? '1' : '0'));
            }

            var fullUrl = clientUrl + (queryParams.length > 0 ? '?' + queryParams.join('&') : '');

            var iframe = document.createElement('iframe');
            iframe.src = fullUrl;
            iframe.title = options.brand ? options.brand + ' 3D Configurator' : 'FlatBuilder 3D Configurator';
            iframe.setAttribute('frameborder', '0');
            iframe.setAttribute('allow', 'accelerometer; autoplay; camera; gyroscope');
            iframe.style.width = '100%';
            iframe.style.height = '100%';
            iframe.style.border = 'none';
            iframe.style.display = 'block';
            iframe.style.borderRadius = 'inherit';

            // Clear container and append iframe
            el.innerHTML = '';
            el.appendChild(iframe);

            return {
                container: el,
                iframe: iframe,
                setApartment: function (sceneId) {
                    FlatBuilder.send(iframe, 'flat:set_apartment', { sceneId: sceneId });
                },
                setTheme: function (theme) {
                    FlatBuilder.send(iframe, 'flat:set_theme', { theme: theme });
                },
                setColor: function (hexColor) {
                    FlatBuilder.send(iframe, 'flat:set_color', { color: hexColor });
                },
                setAtmosphere: function (mode) {
                    FlatBuilder.send(iframe, 'flat:set_atmosphere', { mode: mode });
                },
                openLeadModal: function () {
                    FlatBuilder.send(iframe, 'flat:open_lead_modal', {});
                }
            };
        },

        /**
         * Auto-discover and initialize all [data-flat-widget] containers
         */
        autoInit: function () {
            var elements = document.querySelectorAll('[data-flat-widget], [data-flat-builder]');
            for (var i = 0; i < elements.length; i++) {
                var el = elements[i];
                if (el.getAttribute('data-flat-initialized')) continue;
                el.setAttribute('data-flat-initialized', 'true');

                var opts = {
                    scene: el.getAttribute('data-scene') || el.getAttribute('data-preset'),
                    brand: el.getAttribute('data-brand'),
                    subtitle: el.getAttribute('data-subtitle'),
                    color: el.getAttribute('data-color'),
                    theme: el.getAttribute('data-theme'),
                    logo: el.getAttribute('data-logo'),
                    phone: el.getAttribute('data-phone'),
                    cta: el.getAttribute('data-cta'),
                    webhook: el.getAttribute('data-webhook'),
                    hideBranding: el.hasAttribute('data-hide-branding') ? el.getAttribute('data-hide-branding') === 'true' : undefined,
                    atmosphere: el.hasAttribute('data-atmosphere') ? el.getAttribute('data-atmosphere') === 'true' : undefined,
                    passport: el.hasAttribute('data-passport') ? el.getAttribute('data-passport') === 'true' : undefined,
                    materials: el.hasAttribute('data-materials') ? el.getAttribute('data-materials') === 'true' : undefined,
                };

                FlatBuilder.init(el, opts);
            }
        }
    };

    // Global message listener for postMessage bridge
    window.addEventListener('message', function (e) {
        if (!e.data || typeof e.data !== 'object') return;
        if (e.data.source !== 'flat-builder') return;

        var type = e.data.type;
        var payload = e.data.payload;

        // Trigger registered callbacks
        if (eventListeners[type]) {
            for (var j = 0; j < eventListeners[type].length; j++) {
                try {
                    eventListeners[type][j](payload);
                } catch (err) {
                    console.error('[FlatBuilder Callback Error]', err);
                }
            }
        }

        // Trigger native DOM event on document
        try {
            var customEvent = new CustomEvent(type, { detail: payload });
            document.dispatchEvent(customEvent);
        } catch (evtErr) {}
    });

    // Auto-init on document ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', FlatBuilder.autoInit);
    } else {
        FlatBuilder.autoInit();
    }

    // Expose to window
    window.FlatBuilder = FlatBuilder;

})(window, document);
