# Verified results

Everything below was run in a real n8n Cloud instance (2.39.7) on September 30, 2026, against the live NOAA Storm Prediction Center, US Census geocoder and National Weather Service, with a real Twilio number texting the owner's own cell. Execution ids are n8n's own. What was not run is listed at the end.

## Test customers

| Customer | Address | Why |
| --- | --- | --- |
| Lorena test | 107 S Frontage Rd, Lorena, TX 76655 | 0.7 mi from a real 1.50 in hail report on May 19, 2025 |
| Waco test | 300 Austin Ave, Waco, TX 76701 | About 10 mi away, outside the 3 mi radius |
| Iowa City test | 410 E Washington St, Iowa City, IA 52240 | Inside a Flood Warning active that day |
| Sigourney test | 101 S Main St, Sigourney, IA 52591 | Inside another Flood Warning active that day |
| Not findable | 123 Nowhere Lane, Faketown, ZZ 00000 | Should be reported, not guessed |
| A short line | name and phone only | Should be reported as unusable |

## Runs

| Run | Execution | Setup | Result |
| --- | --- | --- | --- |
| A | 418 | Replay of storm day 250519, stopped before the text | Passed. The Census geocoder found the Lorena and Waco addresses and not the made-up one. The hail report 0.7 mi from Lorena was matched and the Waco address was not. Found a bug: the Weather Service answer arrived as text, so the zone and county were empty and warnings could not have matched |
| | | Fix | The zone lookup now asks for JSON, and the code reads the answer either way. A check was added for it |
| B | 419 | Live warnings, no replay, stopped before the text | Passed. Both Iowa addresses matched real Flood Warnings by county (Johnson and Keokuk). Warnings were read for IA and TX only, the states the customers are in |
| C | 420 | Full run, live warnings | Passed. One text to the owner: what it watches, the Flood Warning with both Iowa names, and the address it could not find. Twilio accepted it (queued) |
| D | 421 | Full run, replay 250519, outreach workflow connected | Passed. The hail group was posted to the outreach workflow, which answered ok with 1 eligible customer, and the owner confirmed the approval text from there arrived on his phone. The owner's own text had the start message and the missing address, not the hail list, as designed. See the outreach repo for the rest of that chain |

## Local checks

[`tests/weather.test.js`](../tests/weather.test.js): 54 checks against the Code node source in the workflow file, with the clock frozen and report lines copied from real Storm Prediction Center files. CI runs them on every push.

## Changes between runs

- After run B: warning end times include the date when they are not today ("until Tue Oct 6, 4:00 AM"), and county names in a warning are separated with semicolons. Runs C and D ran with this.
- After the runs, for n8n's template review (Oct 1): the sticky notes were redone to n8n's rules (a yellow main note of 100 to 300 words with How it works and Setup steps, section notes of 50 words or less, no overlaps), nodes were moved so each sits inside one section note, and the settings ship blank with no example phone numbers or emails. In the Code nodes the only change is the settings check: it now asks for the numbers to be filled in instead of refusing the old example numbers. The matching, texting and handoff code is the code that ran.

## Not run live

- The 30 minute schedule on a published workflow over days, including naming each customer once per storm day across real checks. Covered by the automated checks only.
- A real storm while it happens. Run D used a real past storm day.
- Quiet hours and Twilio refusing a text. Covered by the automated checks only.
- A Storm Prediction Center or Weather Service outage.
- Customer lists from a Google Sheets or database node.
