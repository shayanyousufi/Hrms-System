import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import traceback

from app.core.config import settings


def send_reset_email(to_email: str, code: str) -> tuple[bool, str]:
    try:
        if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
            return False, "SMTP not configured"

        msg = MIMEMultipart()
        msg["From"] = settings.SMTP_USER
        msg["To"] = to_email
        msg["Subject"] = "Password Reset Code - Tech Land"

        html = f"""
        <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
            <div style="max-width: 400px; margin: auto; background: #f9f9f9; border-radius: 16px; padding: 30px; text-align: center;">
                <h2 style="color: #7e22ce;">Tech Land</h2>
                <p style="color: #666;">You requested a password reset.</p>
                <div style="background: #7e22ce; color: white; font-size: 24px; font-weight: bold; padding: 15px; border-radius: 8px; letter-spacing: 8px; margin: 20px 0;">
                    {code}
                </div>
                <p style="color: #999; font-size: 12px;">This code expires in 10 minutes.</p>
                <p style="color: #999; font-size: 12px;">If you didn't request this, ignore this email.</p>
            </div>
        </body>
        </html>
        """

        msg.attach(MIMEText(html, "html"))

        print(f"[EMAIL] Connecting to {settings.SMTP_HOST}:{settings.SMTP_PORT}")
        server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)
        server.ehlo()
        server.starttls()
        server.ehlo()
        print(f"[EMAIL] Logging in as {settings.SMTP_USER}")
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        print(f"[EMAIL] Sending to {to_email}")
        server.sendmail(settings.SMTP_USER, to_email, msg.as_string())
        server.quit()
        print(f"[EMAIL] Sent successfully!")
        return True, "Email sent"
    except Exception as e:
        error_msg = f"{str(e)}"
        print(f"[EMAIL ERROR] {error_msg}")
        print(traceback.format_exc())
        return False, error_msg
