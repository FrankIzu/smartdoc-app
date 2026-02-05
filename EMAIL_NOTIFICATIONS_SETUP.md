# Email Notifications Setup for GitHub Actions

This guide explains how to set up email notifications for build and deployment workflows.

## Overview

The GitHub Actions workflows (`build-ios.yml` and `build-android.yml`) will automatically send email notifications to `dev@grabdocs.com` when:
- ✅ **Build and deployment succeeds** (production builds only)
- ❌ **Build or deployment fails** (production builds only)

## Required GitHub Secrets

Add the following secrets in your GitHub repository:
**Settings → Secrets and variables → Actions → New repository secret**

### SMTP Configuration Secrets

1. **`SMTP_SERVER`**
   - Your SMTP server address
   - Examples:
     - Gmail: `smtp.gmail.com`
     - Outlook: `smtp-mail.outlook.com`
     - SendGrid: `smtp.sendgrid.net`
     - Custom: `mail.yourdomain.com`

2. **`SMTP_PORT`**
   - SMTP server port
   - Common values:
     - `587` (TLS/STARTTLS - recommended)
     - `465` (SSL)
     - `25` (unencrypted - not recommended)

3. **`SMTP_USERNAME`**
   - SMTP authentication username
   - Usually your email address

4. **`SMTP_PASSWORD`**
   - SMTP authentication password
   - For Gmail: Use an [App Password](https://myaccount.google.com/apppasswords)
   - For other providers: Your email password or app-specific password

5. **`SMTP_FROM`**
   - Email address to send from
   - Format: `Name <email@domain.com>` or just `email@domain.com`
   - Example: `GrabDocs CI <ci@grabdocs.com>` or `ci@grabdocs.com`

## Email Provider Examples

### Gmail Setup

1. Enable 2-factor authentication on your Google account
2. Generate an App Password:
   - Go to: https://myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)"
   - Enter "GitHub Actions" as the name
   - Copy the generated 16-character password

3. Set GitHub Secrets:
   ```
   SMTP_SERVER: smtp.gmail.com
   SMTP_PORT: 587
   SMTP_USERNAME: your-email@gmail.com
   SMTP_PASSWORD: [the 16-character app password]
   SMTP_FROM: GrabDocs CI <your-email@gmail.com>
   ```

### SendGrid Setup

1. Create a SendGrid account at https://sendgrid.com
2. Create an API key with "Mail Send" permissions
3. Set GitHub Secrets:
   ```
   SMTP_SERVER: smtp.sendgrid.net
   SMTP_PORT: 587
   SMTP_USERNAME: apikey
   SMTP_PASSWORD: [your SendGrid API key]
   SMTP_FROM: GrabDocs CI <noreply@grabdocs.com>
   ```

### Outlook/Office 365 Setup

1. Set GitHub Secrets:
   ```
   SMTP_SERVER: smtp-mail.outlook.com
   SMTP_PORT: 587
   SMTP_USERNAME: your-email@outlook.com
   SMTP_PASSWORD: [your password]
   SMTP_FROM: GrabDocs CI <your-email@outlook.com>
   ```

### Custom SMTP Server

If you have your own SMTP server:
```
SMTP_SERVER: mail.yourdomain.com
SMTP_PORT: 587
SMTP_USERNAME: ci@yourdomain.com
SMTP_PASSWORD: [your password]
SMTP_FROM: GrabDocs CI <ci@yourdomain.com>
```

## Testing

After setting up the secrets:

1. Trigger a production build:
   ```powershell
   .\scripts\deploy.ps1 -Platform ios -Environment prod
   # Choose option 3 (GitHub Actions)
   ```

2. Check your email (`dev@grabdocs.com`) for:
   - Success notification when build completes
   - Failure notification if something goes wrong

## Email Content

### Success Email Includes:
- Platform (iOS/Android)
- Profile (production/preview/development)
- Workflow run number
- Commit SHA
- Branch name
- Link to workflow run

### Failure Email Includes:
- Same information as success email
- Note that build/deployment failed
- Link to workflow logs for debugging

## Troubleshooting

### Emails not sending?

1. **Check GitHub Actions logs**: Look for the "Send success/failure email" step
2. **Verify secrets are set**: Go to Settings → Secrets and variables → Actions
3. **Test SMTP credentials**: Try sending a test email using the same credentials
4. **Check spam folder**: Emails might be filtered
5. **Verify SMTP server allows connections**: Some servers block automated emails

### Common Issues

- **Gmail**: Must use App Password, not regular password
- **Port 587**: Most providers use this for TLS/STARTTLS
- **Firewall**: Ensure GitHub Actions IPs aren't blocked
- **Rate limits**: Some providers limit emails per day/hour

## Optional: Disable Email Notifications

If you want to disable email notifications temporarily, you can:
1. Remove the email secret values (workflow will skip email step)
2. Or comment out the email steps in the workflow files

## Security Notes

- Never commit SMTP credentials to the repository
- Use app-specific passwords when available
- Rotate passwords regularly
- Consider using a dedicated email account for CI/CD
