'use strict';

const grid = document.querySelector('#app-grid');
const scanButton = document.querySelector('#scan-button');
const warning = document.querySelector('#platform-warning');
const toast = document.querySelector('#toast');
const versionLabel = document.querySelector('#version-label');
const platformLabel = document.querySelector('#platform-label');
let currentStatus = null;

const PLATFORM_LABELS = {
    win32: 'راست‌چین برای ویندوز',
    darwin: 'راست‌چین برای مک‌اواس',
    linux: 'راست‌چین برای لینوکس'
};

const INSTALLATION_LABELS = {
    msix: 'Microsoft Store / MSIX',
    desktop: 'Desktop installer',
    'app-bundle': 'macOS Application',
    deb: 'DEB package',
    rpm: 'RPM package',
    appimage: 'AppImage'
};

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[char]);
}

function localizeError(value) {
    const message = String(value || '');
    const rules = [
        [/Runtime injection is disabled for this build or platform\.?/i, 'یکپارچه‌سازی برای این نسخه یا سیستم‌عامل فعال نیست.'],
        [/This integration is not supported on the current platform\.?/i, 'این یکپارچه‌سازی در سیستم‌عامل فعلی پشتیبانی نمی‌شود.'],
        [/Close (.+) before enabling RTL.*/i, match => `ابتدا ${match[1]} را کامل ببندید و سپس دوباره تلاش کنید.`],
        [/No directly launchable (.+) executable was detected\.?/i, match => `نسخهٔ قابل اجرای ${match[1]} شناسایی نشد.`],
        [/The app launched, but no compatible conversation renderer was found.*/i, 'برنامه اجرا شد، اما صفحهٔ گفتگوی سازگار پیدا نشد.'],
        [/CDP client (?:is )?closed\.?/i, 'ارتباط موقت با برنامه قطع شد.'],
        [/Host exited before integration completed.*/i, 'برنامه پیش از تکمیل یکپارچه‌سازی بسته شد.']
    ];
    for (const [pattern, replacement] of rules) {
        if (pattern.test(message)) return typeof replacement === 'function' ? replacement(message.match(pattern)) : replacement;
    }
    return message;
}

function showToast(message) {
    toast.textContent = localizeError(message) || 'مشکلی پیش آمد. لطفاً دوباره تلاش کنید.';
    toast.classList.remove('hidden');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.add('hidden'), 6500);
}

function statusPresentation(target) {
    const state = target.runtime?.state;
    if (state === 'active') return ['راست‌چین فعال است', 'active'];
    if (state === 'failed') return ['اتصال ناموفق بود', 'error'];
    if (['launching', 'probing', 'stopping'].includes(state)) return ['در حال پردازش', 'warning'];
    if (target.runtimeAvailability === 'host-blocked') return ['در نسخه‌های آینده', 'future'];
    if (target.runtimeAvailability === 'platform-unavailable') return ['در این سیستم‌عامل موجود نیست', 'future'];
    if (target.running) return ['برنامه در حال اجراست', 'warning'];
    if (target.detected) return ['شناسایی شد', ''];
    return ['نصب نشده است', ''];
}

function actionFor(target, status) {
    const state = target.runtime?.state;
    if (state === 'active') {
        return { label: 'غیرفعال کردن راست‌چین', disabled: false, action: 'disable', className: 'primary danger' };
    }
    if (['launching', 'probing', 'stopping'].includes(state)) {
        return { label: 'لطفاً صبر کنید…', disabled: true, action: '', className: 'primary' };
    }
    if (target.runtimeAvailability === 'host-blocked') {
        return { label: 'پشتیبانی در نسخه‌های آینده', disabled: true, action: '', className: 'primary future' };
    }
    if (target.runtimeAvailability === 'platform-unavailable') {
        return { label: 'نسخهٔ سازگار موجود نیست', disabled: true, action: '', className: 'primary future' };
    }
    if (!status.runtimeEnabled) {
        return { label: 'این قابلیت در این نسخه فعال نیست', disabled: true, action: '', className: 'primary' };
    }
    if (!target.detected) {
        return { label: 'برنامه شناسایی نشد', disabled: true, action: '', className: 'primary' };
    }
    if (target.running) {
        return { label: 'ابتدا برنامه را ببندید', disabled: true, action: '', className: 'primary' };
    }
    const executable = target.installations.find(item => item.executable)?.executable || '';
    if (!executable) {
        return { label: 'نسخهٔ قابل اجرا پیدا نشد', disabled: true, action: '', className: 'primary' };
    }
    return {
        label: 'فعال‌سازی راست‌چین',
        disabled: false,
        action: 'enable',
        executable,
        className: 'primary'
    };
}

function renderCard(target, status) {
    const installation = target.installations[0] || {};
    const [label, statusClass] = statusPresentation(target);
    const action = actionFor(target, status);
    const iconName = target.id === 'chatgpt' ? 'chatgpt.png' : 'claude.png';
    const version = installation.version || '—';
    const installType = INSTALLATION_LABELS[installation.source] || installation.source || '—';
    const integrationType = ['host-blocked', 'platform-unavailable'].includes(target.runtimeAvailability)
        ? 'در نسخه‌های آینده'
        : 'اجرای محلی';
    const detail = localizeError(target.runtime?.lastError) || target.blockedReason || (target.detected
        ? 'نسخهٔ برنامه شناسایی شد. برای اطمینان از سازگاری، بررسی اولیه هنگام فعال‌سازی انجام می‌شود.'
        : `ابتدا ${target.name} را نصب کنید و سپس دوباره بررسی کنید.`);
    const rendererDiagnostics = target.runtime?.rendererDiagnostics || [];
    const diagnosticPanel = rendererDiagnostics.length
        ? `<details class="diagnostic-panel">
                <summary>اطلاعات فنی رندرکننده (بدون متن گفتگو)</summary>
                <pre>${escapeHtml(JSON.stringify(rendererDiagnostics, null, 2))}</pre>
           </details>`
        : '';

    return `
        <article class="app-card" data-target="${escapeHtml(target.id)}">
            <div class="app-card-header">
                <div class="app-name">
                    <span class="app-icon-shell" aria-hidden="true">
                        <img class="app-icon" src="../../assets/targets/${iconName}" alt="">
                    </span>
                    <div class="app-copy" dir="ltr"><h3>${escapeHtml(target.name)}</h3><p>${escapeHtml(target.vendor)}</p></div>
                </div>
                <span class="status ${statusClass}">${escapeHtml(label)}</span>
            </div>
            <div class="facts">
                <div class="fact"><span>نسخهٔ نصب‌شده</span><span>${escapeHtml(version)}</span></div>
                <div class="fact"><span>نوع نصب</span><span>${escapeHtml(installType)}</span></div>
                <div class="fact"><span>وضعیت یکپارچه‌سازی</span><span>${escapeHtml(integrationType)}</span></div>
            </div>
            <p class="card-note">${escapeHtml(detail)}</p>
            ${diagnosticPanel}
            <div class="card-actions">
                <button class="${action.className}" type="button" data-action="${action.action}" data-executable="${escapeHtml(action.executable || '')}" ${action.disabled ? 'disabled' : ''}>${escapeHtml(action.label)}</button>
            </div>
        </article>`;
}

function render(status) {
    currentStatus = status;
    versionLabel.textContent = `یکپارچه‌ساز دسکتاپ راست‌چین، نسخهٔ ${status.version}`;
    platformLabel.textContent = PLATFORM_LABELS[status.platform] || 'راست‌چین برای دسکتاپ';
    warning.classList.toggle('hidden', status.supportedPlatform);
    warning.textContent = status.supportedPlatform
        ? ''
        : 'این سیستم‌عامل هنوز برای یکپارچه‌سازی دسکتاپ پشتیبانی نمی‌شود.';
    grid.innerHTML = status.targets.map(target => renderCard(target, status)).join('');
}

scanButton.addEventListener('click', async () => {
    scanButton.disabled = true;
    scanButton.textContent = 'در حال بررسی…';
    try { render(await window.rastchin.scan()); }
    catch (error) { showToast(error.message); }
    finally { scanButton.disabled = false; scanButton.textContent = 'بررسی دوباره'; }
});

grid.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]');
    if (!button || !button.dataset.action) return;
    const card = button.closest('[data-target]');
    const targetId = card?.dataset.target;
    if (!targetId) return;
    button.disabled = true;
    try {
        if (button.dataset.action === 'enable') {
            await window.rastchin.enable({ targetId, executable: button.dataset.executable || '' });
        } else if (button.dataset.action === 'disable') {
            await window.rastchin.disable({ targetId });
        }
        render(await window.rastchin.getStatus());
    } catch (error) {
        showToast(error.message);
        render(await window.rastchin.getStatus());
    }
});

document.addEventListener('click', event => {
    const link = event.target.closest('[data-link]');
    if (link) window.rastchin.openLink(link.dataset.link).catch(error => showToast(error.message));
});

window.rastchin.onStatus(render);
window.rastchin.getStatus().then(render).catch(error => showToast(error.message));
