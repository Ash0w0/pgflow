# WhatsApp automation setup

PGFlow sends automatic rent reminders and receipts from **one PGFlow WhatsApp Business number** on behalf of every PG. Nothing is sent until the steps below are done. Until then, messages wait safely in the queue (`whatsapp_outbox`) and are sent once the number is connected.

## What gets sent

| Message | When | Contains |
|---|---|---|
| Rent reminder | 3 days before, on, and 3 days after the due date, while unpaid (daily job at 10:00 IST) | A fresh 7-day secure UPI payment link |
| Receipt | Right after a UPI or cash payment is approved (retried daily at 18:00 IST) | A secure 1-year link to the official receipt |

Each PG owner turns these on in **Settings → Reminders & receipts on WhatsApp**. They are off by default, and the owner must confirm their residents agreed to receive WhatsApp messages. Read-only (expired trial) PGs get no reminders.

## One-time Meta setup

1. Create or open a **Meta Business account** at business.facebook.com and complete **business verification**.
2. In Meta for Developers, create an app → add **WhatsApp** → add a phone number that is **not** registered on the normal WhatsApp app.
3. Create a **System User** with a **permanent access token** that has `whatsapp_business_messaging` permission.
4. Note the **Phone number ID**, the **App secret** (App settings → Basic), and choose a random **verify token** of at least 32 characters.
5. Webhook: callback URL `https://www.pgflow.co/api/webhooks/whatsapp` (use `www`), verify token from step 4, subscribe to the `messages` field.
6. Submit the four templates below (category **Utility**) and wait for approval.

## Templates (submit exactly; variable order matters)

**`pgflow_rent_due_en`** (English)
> Hi {{1}}, your rent of ₹{{2}} for {{3}} at {{4}} is due on {{5}}. Pay directly to your PG by UPI using this secure link: {{6}}
>
> Please ignore this message if you have already paid.

**`pgflow_rent_due_hi`** (Hindi)
> नमस्ते {{1}}, आपका ₹{{2}} किराया ({{3}}, {{4}}) {{5}} तक देय है। इस सुरक्षित लिंक से सीधे अपने PG को UPI से भुगतान करें: {{6}}
>
> यदि आप पहले ही भुगतान कर चुके हैं तो कृपया इस संदेश को अनदेखा करें।

**`pgflow_payment_receipt_en`** (English)
> Hi {{1}}, your payment of ₹{{2}} for {{3}} has been received. Receipt {{4}} from {{5}}: {{6}}
>
> Thank you.

**`pgflow_payment_receipt_hi`** (Hindi)
> नमस्ते {{1}}, आपका ₹{{2}} का भुगतान ({{3}}) प्राप्त हो गया है। रसीद {{4}}, {{5}}: {{6}}
>
> धन्यवाद।

Every template uses its variables in order {{1}} to {{6}}. Reminders use name, amount, period, PG name, due date, link. Receipts use name, amount, period, receipt number, PG name, link. Links are message variables (not buttons) because every PG has its own web address.

## Vercel settings

Add to the `pgflow` project (Production), then redeploy:

| Name | Value |
|---|---|
| `WHATSAPP_TOKEN` | Permanent system-user access token |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone number ID |
| `WHATSAPP_APP_SECRET` | Meta app secret (webhook signatures) |
| `WHATSAPP_VERIFY_TOKEN` | Your random verify token (32+ characters) |
| `CRON_SECRET` | Random 32+ characters; Vercel Cron sends it to the scheduled jobs |
| `WHATSAPP_GRAPH_BASE_URL` | Optional, e.g. `https://graph.facebook.com/v21.0` to pin a Graph API version |

The schedules live in `vercel.json`. Vercel's Hobby plan runs cron jobs at most once a day, which these schedules respect.

## Checking delivery

- `whatsapp_outbox`: each queued message's state (`pending`, `sending`, `sent`, `failed`, `skipped`), attempts and last error. Failed sends are retried up to 5 times with growing delays.
- `whatsapp_message_logs`: delivery status updates (`sent`, `delivered`, `read`, `failed`) from the signed Meta webhook.
