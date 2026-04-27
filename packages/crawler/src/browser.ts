import { chromium, type Browser, type Page, type BrowserContext } from 'playwright';

let browserInstance: Browser | null = null;

// 反检测脚本：移除自动化特征
const stealthScript = `
  // 移除 navigator.webdriver 标志
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
  // 设置真实的 plugins
  Object.defineProperty(navigator, 'plugins', {
    get: () => [1, 2, 3, 4, 5],
  });
  // 设置真实的 languages
  Object.defineProperty(navigator, 'languages', {
    get: () => ['zh-CN', 'zh', 'en'],
  });
  // 伪装 chrome 对象
  window.chrome = { runtime: {} };
  // 覆盖 permissions 查询
  const originalQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (parameters) =>
    parameters.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission })
      : originalQuery(parameters);
`;

export async function getBrowser(): Promise<Browser> {
  if (!browserInstance) {
    browserInstance = await chromium.launch({ headless: true });
  }
  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

export async function createPage(): Promise<{ page: Page; context: BrowserContext }> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    viewport: { width: 1920, height: 1080 },
    screen: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    hasTouch: false,
  });
  const page = await context.newPage();

  // 注入反检测脚本，对所有页面生效
  await page.addInitScript(stealthScript);

  return { page, context };
}
