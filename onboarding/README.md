# Standard onboarding package

Fill the CSV files with one row per record. Do not send government-ID images, payment screenshots, or WhatsApp exports in this folder. Private documents use the secured upload workflow after the PG account exists.

Required files:

- `property.csv` — branding, address, rent policy, UPI, and reminder defaults
- `rooms.csv` — one row per room; `capacity` determines the bed count
- `tenants.csv` — active residents, assigned bed, rent, deposit, and opening due
- `staff.csv` — owner, manager, and accountant invitations

Validation rules:

- Phone numbers use E.164 format such as `+919876543210`.
- `billing_day` is 1–28.
- Currency values are INR decimal amounts and cannot be negative.
- `electricity_mode` is `disabled`, `flat`, `manual`, `individual_meter`, or `shared_room_meter`.
- Room and bed identifiers are unique within the property.
- Only one active resident may occupy a bed.
- UPI configuration is verified by the owner separately; it is never copied from the fictional demo.

The SLA starts only after validation succeeds and the owner confirms counts, deposits, and opening dues.
