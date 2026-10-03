import 'server-only'

/**
 * Base email template wrapper
 * All email templates should use this wrapper for consistent styling
 */

export interface BaseTemplateProps {
  title: string
  preheader?: string
  children: React.ReactNode
  cta?: {
    text: string
    url: string
  }
  footer?: string
}

export function BaseTemplate({
  title,
  preheader,
  children,
  cta,
  footer,
}: BaseTemplateProps): string {
  const ctaHtml = cta
    ? `
      <p style="margin: 32px 0;">
        <a href="${cta.url}" style="background: #7c3aed; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600; display: inline-block;">
          ${cta.text}
        </a>
      </p>
    `
    : ''

  const footerHtml = footer
    ? `<p style="margin-top: 32px; font-size: 12px; color: #64748b;">${footer}</p>`
    : '<p style="margin-top: 32px; font-size: 12px; color: #64748b;">Kawman ExAct · Enterprise Workspace Platform</p>'

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        ${preheader ? `<meta name="preheader" content="${preheader}">` : ''}
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc;">
        <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%); padding: 32px; text-align: center;">
              <h1 style="margin: 0; color: #fff; font-size: 24px; font-weight: 700;">Kawman ExAct</h1>
            </div>
            
            <!-- Content -->
            <div style="padding: 40px 32px; color: #0f172a;">
              <h2 style="margin: 0 0 24px; font-size: 20px; font-weight: 600; color: #1e293b;">${title}</h2>
              
              <div style="font-size: 15px; line-height: 1.7; color: #334155;">
                ${children}
              </div>
              
              ${ctaHtml}
            </div>
            
            <!-- Footer -->
            <div style="background: #f8fafc; padding: 24px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
              ${footerHtml}
            </div>
          </div>
          
          <p style="text-align: center; margin-top: 24px; font-size: 12px; color: #94a3b8;">
            If you're having trouble with the button above, copy and paste this URL into your browser:<br>
            <span style="word-break: break-all;">${cta?.url || '#'}</span>
          </p>
        </div>
      </body>
    </html>
  `
}

/**
 * Simple text-only template for fallback
 */
export function TextTemplate({
  title,
  children,
  cta,
}: BaseTemplateProps): string {
  let text = `${title}\n\n${children}\n\n`
  
  if (cta) {
    text += `${cta.text}: ${cta.url}\n\n`
  }
  
  text += 'Kawman ExAct · Enterprise Workspace Platform'
  
  return text
}