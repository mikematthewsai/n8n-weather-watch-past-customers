# Design decisions

**Start from your customers, not from the storm.** Hail trackers are built for finding new roofs to knock on. The cheapest job to win is from someone who already paid you once, so this asks one question: which of my customers did this storm touch?

**Free public data only.** The Storm Prediction Center, the Census geocoder and the Weather Service need no account and no key. Nothing to sign up for means nothing to expire. The trade-off is that storm reports are points, not radar swaths, and the texts say so.

**Look each address up once.** Geocoding hundreds of addresses every 30 minutes would be slow and rude to a free service. Each address is looked up once and remembered, up to `lookups_per_run` per check, so a big list is spread over the first few checks.

**Name a customer once per storm day.** A hailstorm produces dozens of reports over hours. Texting the same names every 30 minutes would get the workflow switched off. Each customer is named once per storm day for hail, once for wind, and once per warning. New customers hit later that day are still named.

**Storm days run noon to noon UTC.** That is how the Storm Prediction Center files them, so an evening storm in the US is one storm day even though it crosses midnight UTC.

**Warnings by zone and county, not by polygon.** Many warnings (freezes, heat) have no shape, only a list of zones and counties. Matching by the customer's own zone and county covers both kinds with one rule.

**Only the warnings you pick.** The Weather Service issues dozens of alert types, including advisories and statements. The default list is warnings where a trade business usually has work before or after.

**The owner decides, not the workflow.** This workflow only texts you. Texting customers goes through the separate outreach workflow, which waits for your approval. Some states restrict contacting homeowners right after a disaster, and texting needs consent, so a person should press the button.

**If the handoff fails, you still hear about it.** If the outreach workflow does not answer ok, the summary is texted to you directly on the next check.

**Bad lines and missing addresses are named once.** An address the geocoder cannot find is not guessed. It is named in one text so you can fix it, and not repeated every check.

**A source that stops answering is mentioned once.** After 12 checks in a row without readable reports, one line says so, and one more when it comes back. Silence would look the same as a quiet sky.
