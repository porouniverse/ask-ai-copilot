const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CONFIG_PATH = path.join(__dirname, 'config.json');

const LOG_FILE = path.join("D:/gust/dev/project/github.com/porouniverse/ask-ai-copilot@develop", 'ask-ai-copilot-debug.log');

function log(...args) {
    const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(LOG_FILE, line);
}

/**
 * 获取实际使用的 config.json 路径
 * 打包后优先读取 EXE 同级目录下的外部配置，找不到则降级到 asar 内置版本
 * @returns {string} config.json 的实际路径
 */
function getConfigPath() {
    const exeDir = path.dirname(process.execPath);
    const externalConfig = path.join(exeDir, 'config.json');

    log('[Config] execPath:', process.execPath);
    log('[Config] exeDir (process.execPath parent):', exeDir);
    log('[Config] __dirname:', __dirname);
    log('[Config] Checking external config:', externalConfig);

    if (fs.existsSync(externalConfig)) {
        log('[Config] Using external config.json:', externalConfig);
        return externalConfig;
    }
    log('[Config] External config.json not found, using bundled:', CONFIG_PATH);
    return CONFIG_PATH;
}

const LOCK_FILES = ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'chrome_kill占有令'];
const CHROME_STATE_FILES = ['Last Session', 'Last Tabs', 'Current Session', 'Current Tabs'];

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
 * 清理 Chrome 保存的窗口状态文件，防止旧的窗口位置/大小覆盖 --start-maximized
 * 这些文件记录在 profile 目录（如 Default/）下
 */
function clearChromeStateFiles(profileDir) {
    for (const stateFile of CHROME_STATE_FILES) {
        const statePath = path.join(profileDir, stateFile);
        try {
            if (fs.existsSync(statePath)) {
                fs.unlinkSync(statePath);
                console.log('[Playwright] Removed Chrome state file:', statePath);
            }
        } catch (err) {
            console.warn('[Playwright] Could not remove Chrome state file:', statePath, err.message);
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
 * 获取所有 site 共用的 Playwright User Data 副本目录路径
 * 结构：User Data 同级目录下 user_data_copy_for_playwright/Default
 * @returns {{ profileDir: string, parentDir: string }}
 */
function getSharedUserDataPaths() {
    const userDataDir = getChromeUserDataDir();
    const parentDir = path.join(userDataDir, '..', 'user_data_copy_for_playwright');
    const profileDir = path.join(parentDir, 'Default');
    return { profileDir, parentDir };
}

/**
 * 确保共享 User Data 副本存在；若不存在则从源 profile 复制（仅复制一次）
 * @param {string} sourceProfile 源 profile 名称
 * @returns {string} 共享 profile 的父目录路径
 */
async function ensureSharedProfileCopy(sourceProfile) {
    const { profileDir, parentDir } = getSharedUserDataPaths();

    if (fs.existsSync(profileDir)) {
        const files = fs.readdirSync(profileDir);
        if (files.length > 0) {
            console.log('[Playwright] Shared profile copy already exists at:', profileDir);
            return parentDir;
        }
    }

    console.log('[Playwright] Shared profile copy not found, creating from source...');

    fs.mkdirSync(parentDir, { recursive: true });

    const sourceDir = path.join(getChromeUserDataDir(), sourceProfile);
    if (!fs.existsSync(sourceDir)) {
        throw new Error(`Source profile not found: ${sourceDir}`);
    }

    clearLockFiles(parentDir);

    await copyDirRecursive(sourceDir, profileDir);

    console.log('[Playwright] Shared profile copy created at:', profileDir);
    return parentDir;
}

/**
 * 在单个页签上执行自动化操作
 * @param {object} page Playwright Page 对象
 * @param {object} site 站点配置
 * @param {string} text 用户输入的文本
 */
async function performSiteAutomation(page, site, text) {
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
 * 在单个页签上处理单个站点的自动化流程
 * @param {object} context 浏览器上下文对象
 * @param {object} site 站点配置
 * @param {string} text 用户输入的文本
 * @returns {{ site: object, success: boolean, error: string|null }}
 */
async function processSiteTab(context, site, text) {
    try {
        console.log('[Playwright] Processing site:', site.name, site.url);

        const page = await context.newPage();
        await performSiteAutomation(page, site, text);

        return { site, success: true, error: null };
    } catch (err) {
        console.error(`[Playwright] Site "${site.name}" failed:`, err.message);
        return { site, success: false, error: err.message };
    }
}

/**
 * 执行浏览器自动化（遍历 config.sites 所有站点，共用一个浏览器实例和 User Data）
 * @param {string} text 用户输入的文本
 */
async function performAutomation(text) {
    const actualConfigPath = getConfigPath();
    let config;
    try {
        const raw = fs.readFileSync(actualConfigPath, 'utf-8');
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

    // 所有 site 共用第一个 site 的源 profile（假设同属一个账号）
    const sharedUserDataDir = await ensureSharedProfileCopy(sites[0].sourceProfile);
    clearLockFiles(sharedUserDataDir);
    clearChromeStateFiles(path.join(sharedUserDataDir, 'Default'));

    console.log('[Playwright] Launching single Chrome instance with shared profile:', sharedUserDataDir);
    const context = await chromium.launchPersistentContext(sharedUserDataDir, {
        channel: 'chrome',
        headless: false,
        viewport: null,
        args: [
            '--no-first-run',
            '--no-default-browser-check',
            '--start-maximized',
        ],
    });

    const results = await Promise.all(
        sites.map(site => processSiteTab(context, site, text))
    );

    // await context.close();
    // console.log('[Playwright] Browser closed.');

    const succeeded = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`[Playwright] All sites finished. ${succeeded.length} succeeded, ${failed.length} failed.`);
    for (const r of failed) {
        console.error(`[Playwright] Failed site: "${r.site.name}" — ${r.error}`);
    }
}

module.exports = { performAutomation };
