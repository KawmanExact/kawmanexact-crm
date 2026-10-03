import "server-only";
import { BaseTemplate, TextTemplate } from "./base";

export interface UserInviteTemplateProps {
  loginUrl: string;
  userName: string;
  tempPassword: string;
  organizationName: string;
  invitedByName?: string;
}

export function UserInviteTemplate({
  loginUrl,
  userName,
  tempPassword,
  organizationName,
  invitedByName,
}: UserInviteTemplateProps): { html: string; text: string } {
  const inviterText = invitedByName ? ` by ${invitedByName}` : "";

  const html = BaseTemplate({
    title: `Welcome to ${organizationName}`,
    preheader: "Your Kawman ExAct account is ready — sign in to get started",

    children: `
    <p>Hi ${userName},</p>

    <p>
      Welcome to <strong>Kawman ExAct</strong>! You’ve been added to
      <strong>${organizationName}</strong>${inviterText}.
      Your account has been successfully created and is ready to use.
    </p>

    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <p style="margin: 0 0 12px; font-size: 14px;">
        <strong>Login Email:</strong> ${userName}
      </p>

      <p style="margin: 0; font-size: 14px;">
        <strong>Temporary Password:</strong>
        <code style="background: #fff; padding: 4px 8px; border-radius: 4px; border: 1px solid #e2e8f0;">
          ${tempPassword}
        </code>
      </p>
    </div>

    <p>
      You can now sign in to your Kawman ExAct account using the credentials
      provided above. For your security, please change your temporary password
      immediately after your first login.
    </p>

    <p>
      Once signed in, you’ll be able to access the tools and features available
      to you within <strong>${organizationName}</strong>.
    </p>

    <p>
      If you have any questions or need assistance, please contact your
      administrator.
    </p>
  `,

    cta: {
      text: "Sign In to Kawman ExAct",
      url: "https://kawman-dashboard.vercel.app/login",
    },

    footer:
      "For your security, please change your temporary password immediately after your first login. If you did not expect this invitation, please contact your administrator.",
  });

  const text = TextTemplate({
    title: `Welcome to ${organizationName}`,
    children: `Hi ${userName},\n\nYou've been added to ${organizationName} on Kawman ExAct${inviterText}. Your account has been created.\n\nEmail: ${userName}\nTemporary Password: ${tempPassword}\n\nPlease sign in and change your password immediately.`,
    cta: {
      text: "Sign In",
      url: "https://kawman-dashboard.vercel.app/login",
    },
  });

  return { html, text };
}
