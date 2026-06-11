const { chromium } = require('playwright');
const fs = require('fs');

// --- 常量 ---
const STORAGE_STATE = './playwright-state.json';
const TARGET_PATH = '/api/v2/user/profile';
const MAX_WAIT_MS = 5 * 60 * 1000; // 5 分钟

// 检查状态文件是否存在（首次运行需要手动登录并保存）
let isFirstRun = false;
if (!fs.existsSync(STORAGE_STATE)) {
  isFirstRun = true;
}

// --- 独立方法：用 Playwright context.request 重放请求，自动携带认证 cookie ---
async function replayRequest(context, requestInfo) {
  const { url, method, postData } = requestInfo;
  let res;
  if (method === 'GET') {
    res = await context.request.get(url);
  } else {
    res = await context.request.post(url, { data: postData });
  }
  return { status: res.status(), body: await res.text() };
}

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-hide-scrollbars'],
  });

  // 加载已有登录状态，后续运行自动携带 cookie，无需重新登录
  const context = await browser.newContext({
    storageState: isFirstRun ? undefined : STORAGE_STATE,
  });
  const page = await context.newPage();

  // 用于在 response 阶段找到对应请求的完整信息
  const captured = [];

  // --- 监听请求：完整打印 + 存入数组 ---
  page.on('request', (request) => {
    const url = request.url();
    const isTarget = url.includes(TARGET_PATH);
    if (!isTarget) return;

    const postData = request.postData();
    const info = {
      url,
      method: request.method(),
      headers: request.headers(),
      postData: postData || null,
      timestamp: new Date().toISOString(),
    };
    captured.push(info);

    console.log(`>>> [目标请求]`);
    console.log(`    URL:      ${info.method} ${url}`);
    console.log(`    Headers: ${JSON.stringify(info.headers, null, 2)}`);
    console.log(`    Body:    ${info.postData ? info.postData : '(none)'}`);
    console.log(`    Time:    ${info.timestamp}`);
  });

  // --- 监听响应：打印状态 + 重放 ---
  page.on('response', async (response) => {
    const url = response.url();
    const isTarget = url.includes(TARGET_PATH);
    if (!isTarget) return;

    console.log(`    [原始响应] Status: ${response.status()} | URL: ${url}`);

    // 用 captured 中记录的完整请求信息重放
    const matched = captured.find((r) => r.url === url);
    if (matched) {
      try {
        const replay = await replayRequest(context, matched);
        console.log(`    [重放响应] Status: ${replay.status}`);
        console.log(`    [重放内容] ${replay.body}`);
      } catch (err) {
        console.error(`    [重放失败] ${err.message}`);
      }
    }
  });

  // --- 访问目标页面 ---
  console.log('正在访问 https://dida365.com/webapp ...');
  await page.goto('https://dida365.com/webapp', { waitUntil: 'domcontentloaded' });

  // --- 阶段一：判断是否需要等待登录 ---
  const currentUrl = page.url();
  if (currentUrl.includes('/webapp')) {
    console.log('已处于 webapp 页面，无需等待登录。');
  } else {
    console.log('检测到未登录页面，请手动登录...');
    try {
      await page.waitForURL('**/webapp**', { timeout: MAX_WAIT_MS });
      console.log('登录成功。');
    } catch (e) {
      console.error('等待登录超时 (5 分钟)，程序退出。');
      await browser.close();
      process.exit(1);
    }
  }

  // 首次运行：登录成功后保存状态，后续无需再登录
  if (isFirstRun) {
    console.log('正在保存登录状态到', STORAGE_STATE, '...');
    await context.storageState({ path: STORAGE_STATE });
    console.log('状态已保存。下次运行将自动恢复登录。');
  }

  // --- 阶段二：等待 profile 请求发出 ---
  await page.waitForTimeout(3000);

  console.log('\n演示完成，浏览器保持打开。');
  // await browser.close();
})();
