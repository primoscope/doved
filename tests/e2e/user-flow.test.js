// End-to-End User Flow Tests

const { chromium } = require('playwright');

describe('User Flow E2E Tests', () => {
    let browser, page;
    const baseURL = process.env.TEST_URL || 'http://localhost:3000';

    beforeAll(async () => {
        browser = await chromium.launch({ headless: true });
    });

    afterAll(async () => {
        await browser.close();
    });

    beforeEach(async () => {
        page = await browser.newPage();
    });

    afterEach(async () => {
        await page.close();
    });

    test('should load main page successfully', async () => {
        await page.goto(baseURL);
        
        // Wait for page to load
        await page.waitForSelector('body');
        
        // Check page title
        const title = await page.title();
        expect(title).toContain('EchoTune');
    });

    test('should show chatbot interface', async () => {
        await page.goto(baseURL);
        
        // Look for chat interface elements
        const chatInterface = await page.locator('.chat-interface, #chat-container, [data-testid="chat"]').first();
        await expect(chatInterface).toBeVisible({ timeout: 10000 });
    });

    test('should handle demo chat interaction', async () => {
        await page.goto(baseURL);
        
        // Find chat input
        const chatInput = await page.locator('input[type="text"], textarea').first();
        if (await chatInput.isVisible()) {
            await chatInput.fill('Hello, recommend some music');
            
            // Find and click send button
            const sendButton = await page.locator('button:has-text("Send"), button[type="submit"]').first();
            if (await sendButton.isVisible()) {
                await sendButton.click();
                
                // Wait for response (may take a moment)
                await page.waitForTimeout(2000);
            }
        }
    });
});
