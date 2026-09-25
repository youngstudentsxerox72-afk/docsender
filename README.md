# Doc Sender Pro

Build a production-ready full-stack web application called "Students Graphics Document Mailer".

PURPOSE

I run a document/Xerox service called Students Graphics. I want a very simple application where I only need to:

1. Enter the recipient's email address.

2. Upload a scanned document (PDF or DOCX).

3. Click "Send Document".

Everything else must happen automatically:

- Generate a visual preview of the document.

- Create a professional HTML email.

- Put the document preview ABOVE the Students Graphics footer.

- Embed the Students Graphics footer image at the bottom of the email.

- Attach the original uploaded PDF/DOCX to the email.

- Send the email automatically from my connected Gmail account using the Gmail API.

- Show clear success/error status.

IMPORTANT EMAIL BEHAVIOR

The actual Gmail attachment UI must NOT be relied upon for the visual preview.

The email itself must contain:

1. Email message text.

2. Inline document preview.

3. Information about the attached original document.

4. Students Graphics footer image.

The original document must also be attached as a real MIME attachment.

EMAIL LAYOUT

Dear Sir/Madam,

Please find the scanned document as requested.

Document Details:

Document Name: [detected or entered document name]

File Name: [original filename]

Reference No.: [optional, if available]

Please find the document preview below. The original file is attached to this email for your reference.

[DOCUMENT PREVIEW CARD]

The document preview card should look professional and should contain:

- PDF/DOCX icon

- Filename

- "Scanned Document" label

- Preview of the first page

- A note saying "The original document is attached to this email."

Then:

Kindly acknowledge the receipt of the document.

Regards,

Students Graphics

[STUDENTS GRAPHICS FOOTER IMAGE]

The footer image must always be BELOW the document preview and email message.

DOCUMENT PREVIEW

For PDF:

- Convert the first page of the PDF into a high-quality PNG/JPEG preview.

- Display that image inline inside the HTML email.

- Preserve the document's appearance and aspect ratio.

- Do not modify the original PDF.

For DOCX:

- Generate a first-page preview where possible.

- Preserve formatting as closely as possible.

- If reliable DOCX rendering is not available server-side, convert the DOCX to PDF first and then generate the first-page image from that PDF.

- Never replace or modify the original DOCX attachment.

EMAIL MIME STRUCTURE

Build the outgoing email as a proper MIME message.

The document preview image must be an INLINE MIME resource using Content-ID / cid so it appears inside the HTML email.

The Students Graphics footer image must also be an INLINE MIME resource using Content-ID / cid.

The original uploaded document must remain a normal attachment.

Conceptually the MIME email should contain:

multipart/mixed

 ├── multipart/related

 │    ├── text/html

 │    ├── inline document preview image

 │    └── inline Students Graphics footer image

 └── original PDF/DOCX attachment

Do NOT simply put the preview image in the attachment list.

GMAIL INTEGRATION

Use Google OAuth 2.0 and Gmail API.

Requirements:

- "Connect Gmail" button.

- User signs in with Google.

- Request only the minimum Gmail permissions required to send email.

- Use OAuth access/refresh token securely.

- Never ask for or store the user's Gmail password.

- Never expose Gmail client secrets or access tokens in frontend code.

- Perform Gmail API calls from the secure backend/server side.

- Send the email from the authenticated Gmail account.

- Use Gmail's send endpoint with the properly encoded MIME message.

- Handle expired access tokens by refreshing them securely.

- Show which Gmail account is connected.

- Provide "Disconnect Gmail".

AUTHENTICATION

Create secure application authentication as well.

For the first version, keep it simple:

- Login page.

- Email/password authentication or Google authentication for the app itself.

- After login, show dashboard.

Do not expose private credentials in client-side code.

MAIN DASHBOARD

Create a clean professional dashboard for Students Graphics.

Top section:

- Students Graphics logo/name

- Connected Gmail account

- Connection status

- Disconnect Gmail

- Logout

Main "Send Document" card:

Recipient Email

[________________________________]

Subject

[ Scanned Document - {filename} ]

Optional Reference Number

[________________________________]

Upload Document

[ Drag & Drop PDF/DOCX here ]

or

[ Browse Files ]

Show:

- filename

- file type

- file size

- remove button

Email Preview

Show a live preview of the actual HTML email before sending.

The preview should contain:

- message

- document preview

- footer image

Buttons:

[ Preview Email ]

[ Send Document ]

After sending:

SUCCESS STATE

"Document sent successfully"

Recipient email

Subject

Filename

Time sent

ERROR STATE

Show a useful human-readable error.

SUPPORTED FILES

- PDF

- DOCX

- reasonable file size limit such as 20 MB

- validate file type

- reject unsupported files

- display friendly validation errors

FOOTER IMAGE

Create a configurable Students Graphics footer.

The footer should support an uploaded image file, preferably PNG/JPG.

Initially use the Students Graphics footer design with:

- Students Graphics branding

- 416, M.G. Road

- Near Bharathidasan Women's College

- Pondicherry – 605 003

- phone number

- email address

- "QUALITY PRINTS • ON TIME • EVERY TIME"

However, do NOT hard-code these details permanently into components. Create a settings page where I can upload/change the footer image later.

SETTINGS PAGE

Create:

- Gmail connection

- Footer image upload/change

- Default subject template

- Default email body

- Sender display name

- Maximum upload size

- Allowed file types

EMAIL TEMPLATE

Use responsive HTML email compatible with Gmail and common email clients.

Do not depend on external CSS files.

Use inline CSS.

Make the email clean and professional rather than overly decorative.

The document preview should have:

- white background

- subtle border

- rounded corners

- filename header

- document type icon

- large first-page preview

- attachment note

Make it look similar to a professional company transactional email.

IMPORTANT:

The footer must visually appear AFTER the document preview in the HTML body.

MOBILE RESPONSIVENESS

The generated email must work well on:

- Gmail web

- Gmail mobile

- Outlook as much as practical

- desktop

- mobile devices

The document preview image must scale responsively without distortion.

SECURITY

Implement:

- server-side Gmail API communication

- secure token storage

- encrypted secrets where appropriate

- file type validation

- file size validation

- protection against malicious filenames

- do not execute uploaded DOCX files

- sanitize any user-generated HTML/text

- do not expose OAuth tokens to browser/client

- delete temporary rendered preview files after sending unless needed for audit/history

- never log OAuth access tokens

- never log sensitive document contents

DATA STORAGE

Store only what is necessary.

Keep a lightweight sent-history table containing:

- recipient email

- filename

- subject

- status

- timestamp

- sender Gmail account

- optional reference number

Do NOT permanently store document contents unless explicitly required.

Temporary uploaded documents and generated preview images should be automatically cleaned up after successful sending.

SENT HISTORY PAGE

Create a page showing:

- date/time

- recipient

- filename

- subject

- status

Allow search/filter by recipient or filename.

Do not allow downloading old documents unless they were intentionally stored.

UI/UX

Use a modern clean business dashboard.

Primary workflow must require as few clicks as possible.

Ideal workflow:

Login

 ↓

Connect Gmail once

 ↓

Enter recipient email

 ↓

Upload PDF/DOCX

 ↓

Preview automatically appears

 ↓

Click Send Document

 ↓

Email sent from my Gmail

NO manual email composition should be required.

IMPORTANT TECHNICAL REQUIREMENTS

Use Lovable's normal full-stack architecture.

Use a secure backend/server function for:

- file processing

- document preview generation

- Gmail OAuth handling

- MIME email generation

- Gmail API sending

Do not attempt to send Gmail API requests directly with secret credentials from React/browser code.

Use a reliable server-side document rendering approach.

For PDFs use a reliable PDF rendering library such as PyMuPDF or an equivalent server-compatible solution.

For DOCX use a reliable DOCX-to-PDF/rendering strategy available in the selected runtime.

Create reusable email-generation functions.

The generated MIME email must support:

- HTML body

- inline CID images

- original document attachment

- correct Content-Type

- correct Content-Disposition

- correct filename

- UTF-8 encoding

- base64url encoding required by Gmail API

GMAIL SEND FLOW

Implement:

1. User clicks Connect Gmail.

2. OAuth consent flow starts.

3. Callback securely stores the refresh token.

4. Dashboard shows connected Gmail address.

5. User uploads document.

6. Server validates file.

7. Server generates first-page preview.

8. Server creates HTML email.

9. Server creates MIME multipart/related + multipart/mixed message.

10. Server inserts preview image as inline CID.

11. Server inserts Students Graphics footer as inline CID.

12. Server attaches original document.

13. Server base64url encodes MIME message.

14. Server calls Gmail API users.messages.send.

15. Server records result in sent history.

16. Frontend shows success or clear error.

ERROR HANDLING

Handle:

- Gmail not connected

- OAuth failure

- expired/revoked token

- invalid recipient email

- unsupported file

- file too large

- corrupt PDF

- corrupt DOCX

- preview generation failure

- Gmail API failure

- network timeout

- quota/rate-limit errors

Give actionable messages such as:

"Please connect your Gmail account first."

"The uploaded DOCX could not be rendered. Please try converting it to PDF."

"Your Gmail authorization has expired. Please reconnect Gmail."

DO NOT BUILD A FAKE DEMO

This must be a real working application.

Do not use mock email sending.

Do not simulate Gmail API success.

Do not create a fake "sent" response.

The Send button must send a real email through Gmail API after OAuth is configured.

ENVIRONMENT VARIABLES

Create a clear configuration area/documentation for:

GOOGLE_CLIENT_ID

GOOGLE_CLIENT_SECRET

GOOGLE_REDIRECT_URI

And any required backend/service configuration.

Do not put secrets in the frontend.

SETUP INSTRUCTIONS

After building the application, provide clear instructions for:

1. Creating a Google Cloud project.

2. Enabling Gmail API.

3. Configuring OAuth consent screen.

4. Creating OAuth 2.0 credentials.

5. Adding authorized redirect URI.

6. Adding required environment variables to Lovable.

7. Testing Gmail connection.

8. Sending the first real document.

Also explain exactly which Google OAuth scopes are required and why.

FINAL RESULT

The final application should feel like a simple internal tool for a Xerox/CSC/document service center.

The operator should NOT need technical knowledge.

The operator experience should be:

"Enter email → Upload document → Send"

Everything else must be automatic.

Use Gmail OAuth + Gmail API, not Gmail SMTP with an app password. OAuth is the better architecture for an application like this because the user can explicitly authorize the app and revoke access later.

Also, the document preview is not the actual attachment card. Lovable needs to generate a first-page image and embed it into the HTML email using cid:. The original PDF/DOCX is then attached separately. That is what gives you the company-style result you were asking about.

For your case, the final workflow can be as simple as:

Recipient email → Upload PDF/DOCX → automatic preview → Send → sent from your Gmail with Students Graphics footer.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://docsender.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a11e729c-2abd-4c42-ab2b-956f6052f9a5).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
