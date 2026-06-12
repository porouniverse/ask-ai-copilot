const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const LOCK_FILES = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'chrome_kill占有令'];

/**
 * 获取源 Chrome User Data 目录路径
 */
function getChromeUserDataDir() {
    if (process.platform === 'win32') {
        return path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data');
    } else if (process.platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
    } else {
        return path.join(os.homedir(), '.config', 'google-chrome');
    }
}

/**
 * 清理目录下的锁文件，防止 Chrome 未正常关闭导致无法启动
 */
function clearLockFiles(dir) {
    for (const lockFile of LOCK_FILES) {
        const lockPath = path.join(dir, lockFile);
        try {
            if (fs.existsSync(lockPath)) {
                fs.unlinkSync(lockPath);
                console.log('[Playwright] Removed lock file:', lockPath);
            }
        } catch (err) {
            console.warn('[Playwright] Could not remove lock file:', lockPath, err.message);
        }
    }
}

/**
 * 递归复制目录
 */
async function copyDirRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            await copyDirRecursive(srcPath, destPath);
        } else {
            try {
                fs.copyFileSync(srcPath, destPath);
            } catch (err) {
                if (err.code !== 'EBUSY' && err.code !== 'ENOENT') {
                    console.warn('[Playwright] Copy file failed (ignored):', srcPath, err.message);
                }
            }
        }
    }
}


/**
 * 获取指定站点的 Playwright profile 副本目录路径
 * 结构：User Data 同级目录下 user_data_copy_for_playwright/site_{index}/Default
 * @param {number} siteIndex 站点索引
 * @param {string} sourceProfile 源 profile 名称
 * @returns {{ profileDir: string, parentDir: string }}
 */
function getSiteProfilePaths(siteIndex, sourceProfile) {
    const userDataDir = getChromeUserDataDir();
    const parentDir = path.join(userDataDir, '..', `user_data_copy_for_playwright`, `site_${siteIndex}`);
    const profileDir = path.join(parentDir, 'Default');
    return { profileDir, parentDir };
}

/**
 * 为指定站点确保 Playwright profile 副本存在；若不存在则从源 profile 复制
 * 每个 site 用独立的子目录，避免 Playwright 复用已有浏览器实例
 * @param {number} siteIndex 站点索引
 * @param {string} sourceProfile 源 profile 名称
 * @returns {string} 站点 profile 的父目录路径
 */
async function ensureProfileCopyForSite(siteIndex, sourceProfile) {
    const { profileDir, parentDir } = getSiteProfilePaths(siteIndex, sourceProfile);

    if (fs.existsSync(profileDir)) {
        const files = fs.readdirSync(profileDir);
        if (files.length > 0) {
            console.log(`[Playwright] Profile copy already exists for site ${siteIndex} at:`, profileDir);
            return parentDir;
        }
    }

    console.log(`[Playwright] Profile copy not found for site ${siteIndex}, creating from source...`);

    fs.mkdirSync(parentDir, { recursive: true });

    const sourceDir = path.join(getChromeUserDataDir(), sourceProfile);
    if (!fs.existsSync(sourceDir)) {
        throw new Error(`Source profile not found: ${sourceDir}`);
    }

    clearLockFiles(parentDir);

    await copyDirRecursive(sourceDir, profileDir);

    console.log(`[Playwright] Profile copy created for site ${siteIndex} at:`, profileDir);
    return parentDir;
}

/**
 * 在单个站点上执行自动化操作
 * @param {object} context 浏览器上下文对象
 * @param {object} site 站点配置
 * @param {string} text 用户输入的文本
 */
async function performSiteAutomation(context, site, text) {
    let page = context.pages()[0];
    if (!page) {
        page = await context.newPage();
    }

    console.log('[Playwright] Navigating to:', site.url);
    await page.goto(site.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    if (site.inputMode === 'contenteditable') {
        await page.locator(site.inputSelector).click();
        await page.keyboard.press('Control+A');
        await page.keyboard.type(text);
        console.log('[Playwright] Content filled into contenteditable.');
    } else {
        await page.fill(site.inputSelector, text);
        console.log('[Playwright] Content filled with page.fill().');
    }

    await page.waitForTimeout(500);

    await page.click(site.buttonSelector);
    console.log('[Playwright] Button clicked:', site.buttonSelector);
}

/**
 * 处理单个站点的自动化流程，每个站点拥有独立的错误处理
 * @param {object} site 站点配置
 * @param {number} siteIndex 站点索引
 * @param {string} text 用户输入的文本
 * @returns {{ site: object, success: boolean, error: string|null }}
 */
async function processSite(site, siteIndex, text) {
    try {
        console.log('[Playwright] Processing site:', site.name, site.url);

        const userDataDir = await ensureProfileCopyForSite(siteIndex, site.sourceProfile);
        clearLockFiles(userDataDir);

        console.log('[Playwright] Launching Chrome with profile:', userDataDir);
        const context = await chromium.launchPersistentContext(userDataDir, {
            channel: 'chrome',
            headless: false,
            args: [
                '--no-first-run',
                '--no-default-browser-check',
            ],
        });

        await performSiteAutomation(context, site, text);
        return { site, success: true, error: null };
    } catch (err) {
        console.error(`[Playwright] Site "${site.name}" failed:`, err.message);
        return { site, success: false, error: err.message };
    }
}

/**
 * 执行浏览器自动化（遍历 config.sites 所有站点）
 * @param {string} text 用户输入的文本
 */
async function performAutomation(text) {
    let config;
    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        config = JSON.parse(raw);
    } catch (err) {
        console.error('[Playwright] Failed to read config.json:', err.message);
        return;
    }

    const sites = config.sites;
    if (!sites || sites.length === 0) {
        console.error('[Playwright] No sites configured in config.json.');
        return;
    }

    console.log('[Playwright] User input:', text);

    const results = await Promise.all(
        sites.map((site, index) => processSite(site, index, text))
    );

    const succeeded = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`[Playwright] All sites finished. ${succeeded.length} succeeded, ${failed.length} failed.`);
    for (const r of failed) {
        console.error(`[Playwright] Failed site: "${r.site.name}" — ${r.error}`);
    }
}

module.exports = { performAutomation };
