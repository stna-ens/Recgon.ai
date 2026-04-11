import { Resend } from 'resend';

export async function sendOtpEmail(email: string, code: string): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: 'Recgon <noreply@recgon.app>',
    to: email,
    subject: `${code} is your Recgon verification code`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem;">
        <h2 style="font-size: 1.25rem; font-weight: 700; margin: 0 0 1rem;">Verify your email</h2>
        <p style="color: #666; margin: 0 0 1.5rem;">Enter this code to complete your Recgon account registration. It expires in 10 minutes.</p>
        <div style="font-size: 2rem; font-weight: 700; letter-spacing: 0.5rem; padding: 1rem 1.5rem; background: #f5f5f5; border-radius: 8px; display: inline-block; font-family: monospace;">${code}</div>
        <p style="color: #999; font-size: 0.8rem; margin: 1.5rem 0 0;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });

  if (error) {
    throw new Error(`Failed to send verification email: ${error.message}`);
  }
}
