window.addEventListener("DOMContentLoaded",()=>{const t=document.createElement("script");t.src="https://www.googletagmanager.com/gtag/js?id=G-W5GKHM0893",t.async=!0,document.head.appendChild(t);const n=document.createElement("script");n.textContent="window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', 'G-W5GKHM0893');",document.body.appendChild(n)});// ===== PakePlus 注入脚本：弱信号风控 + 原有跳转兼容 =====

// === 1) 你原有的 open/blank 兼容逻辑 ===
const hookClick = (e) => {
    const origin = e.target.closest('a')
    const isBaseTargetBlank = document.querySelector('head base[target="_blank"]')
    if (
        (origin && origin.href && origin.target === '_blank') ||
        (origin && origin.href && isBaseTargetBlank)
    ) {
        e.preventDefault()
        location.href = origin.href
    }
}

window.open = function (url, target, features) {
    location.href = url
}

document.addEventListener('click', hookClick, { capture: true })

// === 2) 弱信号风控埋点 ===
const RiskReporter = (() => {
    const ENDPOINT = '/risk/event'
    const USER_ID = (typeof window !== 'undefined' && window.__USER_ID__) ? window.__USER_ID__ : '{$userinfo.id}'
    const DEVICE_KEY = 'im_device_id'
    const MIN_INTERVAL_MS = 2000
    const lastSent = new Map()

    function getDeviceId() {
        try {
            let v = localStorage.getItem(DEVICE_KEY)
            if (!v) {
                v = 'h5_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)
                localStorage.setItem(DEVICE_KEY, v)
            }
            return v
        } catch (e) {
            return 'h5_' + Date.now()
        }
    }

    function now() {
        return Date.now()
    }

    function shouldThrottle(key) {
        const t = lastSent.get(key) || 0
        if (now() - t < MIN_INTERVAL_MS) return true
        lastSent.set(key, now())
        return false
    }

    function getNetworkType() {
        try {
            const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection
            return c && c.effectiveType ? c.effectiveType : ''
        } catch (e) {
            return ''
        }
    }

    function getPageInfo() {
        return {
            page_id: location.pathname || '',
            page_name: document.title || ''
        }
    }

    function send(eventName, riskContext = {}) {
        if (!eventName) return
        const throttleKey = eventName + '::' + (riskContext.reason || '')
        if (shouldThrottle(throttleKey)) return

        const base = getPageInfo()
        const payload = {
            event_name: eventName,
            event_time: now(),
            user_id: USER_ID,
            device_id: getDeviceId(),
            session_id: '',
            page_id: base.page_id,
            page_name: base.page_name,
            is_sensitive_page: 0,
            platform: 'h5',
            app_version: '',
            os_version: '',
            network_type: getNetworkType(),
            channel: '',
            risk_context: riskContext
        }

        try {
            if (navigator.sendBeacon) {
                const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
                navigator.sendBeacon(ENDPOINT, blob)
            } else {
                fetch(ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    keepalive: true
                }).catch(() => {})
            }
        } catch (e) {}
    }

    return { send }
})()

// === 3) 弱信号事件监听 ===
document.addEventListener('visibilitychange', () => {
    RiskReporter.send('security_weak_visibility', {
        state: document.visibilityState || ''
    })
})

window.addEventListener('blur', () => {
    RiskReporter.send('security_weak_blur', { reason: 'window_blur' })
})

window.addEventListener('focus', () => {
    RiskReporter.send('security_weak_focus', { reason: 'window_focus' })
})

document.addEventListener('copy', () => {
    RiskReporter.send('security_weak_copy', { reason: 'copy' })
})

document.addEventListener('contextmenu', (e) => {
    RiskReporter.send('security_weak_contextmenu', { reason: 'contextmenu' })
})

let longPressTimer = null
document.addEventListener('touchstart', (e) => {
    clearTimeout(longPressTimer)
    longPressTimer = setTimeout(() => {
        RiskReporter.send('security_weak_longpress', { reason: 'touch_longpress' })
    }, 650)
}, { passive: true })

document.addEventListener('touchend', () => {
    clearTimeout(longPressTimer)
})