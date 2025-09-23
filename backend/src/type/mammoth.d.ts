declare module 'mammoth' {
  export function extractRawText(options: { path: string }): Promise<{ value: string; messages: any[] }>;
  export function convertToHtml(options: { path: string }): Promise<{ value: string; messages: any[] }>;
}