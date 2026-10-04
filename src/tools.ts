import type { Page } from "playwright";

export type ToolResult = {
    success: boolean;
    url: string;
    observation: string;
    error?: string;
};

const MAX_OBSERVATION = 4000;

function clip(text: string): string {
    const trimmed = text.replace(/[ \t]+\n/g, "\n").trim();
    if (trimmed.length <= MAX_OBSERVATION) return trimmed;
    return `${trimmed.slice(0, MAX_OBSERVATION)}…`;
}
async function observe(page: Page): Promise<string> {
    const title = await page.title();
    const body = await page.locator("body").innerText();
    const fields = await page.locator("input, textarea").evaluateAll((elements) =>
      elements.map((element) => {
        const field = element as HTMLInputElement | HTMLTextAreaElement;
        const label = field.id
          ? document.querySelector(`label[for="${CSS.escape(field.id)}"]`)?.textContent?.trim()
          : "";
        const name = label || field.name || field.id || "field";
        return `${name}: ${field.value}`;
      }),
    );
    const form = fields.length > 0 ? `\n\n${fields.join("\n")}` : "";
    return clip(`${title}\n\n${body}${form}`);
}


function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
  
export function createBrowserTools(page:Page){
    return {
        async navigate(args:{url:string}):Promise<ToolResult>{
            try{
                await page.goto(args.url);
                return {
                    success:true,
                    url:page.url(),
                    observation:await observe(page)
                }
            }catch(error){
                return {
                    success: false,
                    url: args.url,
                    observation: "Navigation failed.",
                    error: message(error),
                }
            }
        },
        async extract(): Promise<ToolResult> {
            try {
              return { success: true, url: page.url(), observation: await observe(page) };
            } catch (error) {
              return {
                success: false,
                url: page.url(),
                observation: "Could not read the current page.",
                error: message(error),
              };
            }
          },
        async click(args: { name: string }): Promise<ToolResult> {
            const target = page
              .getByRole("link", { name: args.name, exact: true })
              .or(page.getByRole("button", { name: args.name, exact: true }));
            try {
              if ((await target.count()) === 0) {
                return {
                  success: false,
                  url: page.url(),
                  observation: await observe(page),
                  error: `Could not find a link or button named ${args.name}`,
                };
              }
              await target.click();
              return { success: true, url: page.url(), observation: await observe(page) };
            } catch (error) {
              return {
                success: false,
                url: page.url(),
                observation: await observe(page).catch(() => "Could not read the current page."),
                error: message(error),
              };
            }
        },
        async fill(args: { label: string; value: string }): Promise<ToolResult> {
            const field = page.getByLabel(args.label, { exact: true });
            try {
              if ((await field.count()) === 0) {
                return {
                  success: false,
                  url: page.url(),
                  observation: await observe(page),
                  error: `Could not find a field labeled ${args.label}`,
                };
              }
              await field.fill(args.value);
              return { success: true, url: page.url(), observation: await observe(page) };
            } catch (error) {
              return {
                success: false,
                url: page.url(),
                observation: await observe(page).catch(() => "Could not read the current page."),
                error: message(error),
              };
            }
        },
    }
}