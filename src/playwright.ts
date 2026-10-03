import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({headless: false});  
  const page = await browser.newPage();
  await page.goto('https://www.google.com');
  const title = await page.title();
  console.log(title);
  await browser.close();
})();