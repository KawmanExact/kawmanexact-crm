declare module 'pdf-parse' {
  export default function pdf(buffer: Buffer): Promise<{ text: string; numpages: number; numrender: number; info: unknown; metadata: unknown; version: string }>
}
declare module 'pdf-parse/lib/pdf-parse.js' {
  export default function pdf(buffer: Buffer): Promise<{ text: string; numpages: number; numrender: number; info: unknown; metadata: unknown; version: string }>
}
