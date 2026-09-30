# Weather watch: hail, wind and warnings matched to your past customers

A standalone n8n workflow for service businesses whose work follows the weather. Every 30 minutes it reads the free public storm reports and weather warnings, finds which of **your own past customers** they touch, and texts you their names, how close the storm came and how big it was.

- A roofer hears that 1.75 inch hail fell 0.8 miles from 14 of last year's customers.
- A plumber hears that a Hard Freeze Warning covers 38 past customers tonight.
- HVAC hears about an Extreme Heat Warning, a tree service about High Wind, a water damage company about Flood Warnings.

It needs n8n and a Twilio account. The weather data and the address lookups are free and need no account. No database, no spreadsheet, no community nodes, no AI model.

It pairs with [n8n-approve-text-follow-up-sms](https://github.com/mikematthewsai/n8n-approve-text-follow-up-sms), which can text those customers for you, after you approve, with follow-ups that stop when they reply.

## The business problem

Past customers are the warmest leads a trade business has. They already trust you, you know their house, and after a hailstorm or a hard freeze many of them need you again. Most never hear from the business that did their last job, because nobody has time to watch the weather service and cross-check it against a customer list. Paid hail trackers exist for roofers, from around $30 a month up, and they are built around finding new addresses to knock on. This works the other way round: it starts from the customers you already have.

## What it does

1. **Finds each address once.** New addresses go to the free [US Census geocoder](https://geocoding.geo.census.gov/) for latitude and longitude, then to the [National Weather Service](https://www.weather.gov/documentation/services-web-api) for the forecast zone and county. Both are remembered, so each address is looked up once.
2. **Reads the storm reports.** The NOAA [Storm Prediction Center](https://www.spc.noaa.gov/climo/reports/) publishes every hail and wind report as a CSV file per storm day: time, size or speed, place, latitude and longitude. It reads today's and yesterday's.
3. **Reads the warnings.** Active National Weather Service warnings for the states your customers are in, matched by forecast zone or county.
4. **Matches.** Every past customer within your radius (default 3 miles) of a hail report of 1 inch or more, a wind report of 58 mph or more or a wind damage report, or inside a warning on your list.
5. **Texts you once.** Names, phone numbers, distance, size and local time, strongest first. Each customer is named once per storm day for hail or wind, and once per warning, so a long storm does not keep texting you.

The first run texts you what it is watching, how many addresses it found, and any it could not find. Quiet hours hold texts for the morning. A text Twilio refuses goes again with the next check, up to five tries.

[examples/owner-texts.md](examples/owner-texts.md) shows real texts from the live test.

## Your customers

Paste them into the **Your customers** node, one per line:

```
# name | phone | email | address | ok to text (yes/no)
Jane Smith | 404-555-0101 | jane@example.com | 123 Oak St, Marietta, GA 30060 | yes
Tom Brown | 404-555-0102 | | 456 Pine Rd, Kennesaw, GA 30144 | no
```

Or replace that node with a Google Sheets, Airtable or database node that returns items with the columns `name`, `phone`, `email`, `address`, `ok_to_text`, and optionally `lat` and `lon`. With lat and lon given, the geocoder is skipped for that row.

`ok to text` is only used if you connect the outreach workflow. This workflow only ever texts you.

## Requirements

- n8n Cloud or self-hosted n8n. Tested on n8n Cloud 2.39.7.
- Core nodes only: Schedule Trigger, Set, Code, If, HTTP Request and No Operation.
- A Twilio account, a number on it, and a Twilio credential in n8n. In the US the number needs A2P 10DLC registration or toll-free verification to text your cell.
- US addresses. The Census geocoder and the Weather Service cover the United States only.

## Install

1. Import [`workflow/weather-watch-past-customers.json`](workflow/weather-watch-past-customers.json).
2. Select your Twilio credential on **Find your Twilio account** and **Text you**.
3. Fill in **Your settings** and **Your customers**.
4. Publish it. The first check texts you what it is watching.

It will not run with the example phone numbers still in. The run stops in red in n8n and says why.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `business_name` | `Your Business` | Used in the texts |
| `business_number` | `+15555550100` | Your Twilio number |
| `owner_cell` | `+15555550199` | Where the texts go |
| `timezone` | `America/New_York` | Times in the texts, and quiet hours |
| `contact_email` | `you@example.com` | Sent to the Weather Service in the User-Agent, which it asks for |
| `radius_miles` | `3` | How close a storm report has to be to a customer |
| `watch_hail`, `hail_min_inches` | `true`, `1` | Hail reports of this size or more |
| `watch_wind`, `wind_min_mph` | `true`, `58` | Wind reports of this speed or more |
| `wind_damage_reports` | `true` | Also count wind reports with no speed, which are damage reports |
| `warnings` | 12 kinds | Warning names to watch, comma separated, exactly as the Weather Service names them |
| `quiet_start`, `quiet_end` | `21:00`, `07:00` | Texts to you wait until morning |
| `max_names` | `8` | Names listed per group before "plus N more" |
| `lookups_per_run` | `25` | New addresses looked up per check, so a big list is spread over several checks |
| `outreach_url`, `outreach_key` | blank | Set both to hand each group to the outreach workflow instead of texting you the list |
| `hail_message`, `wind_message`, `warning_message` | a short check-in each | The customer message handed to the outreach workflow. `{first_name}`, `{business_name}`, `{date}`, `{size}`, `{event}` and `{until}` are filled in |
| `replay_spc_day` | blank | For testing: a past storm day written YYMMDD |

The default warnings: Hard Freeze, Freeze, Extreme Cold, Extreme Heat, Excessive Heat, High Wind, Flash Flood, Flood, Ice Storm, Winter Storm, Hurricane and Tropical Storm Warnings.

## Trying it out

1. Set `replay_spc_day` to a past storm day, for example `250519` (May 19, 2025, a big hail day in Texas).
2. Add a customer near one of that day's reports. `107 S Frontage Rd, Lorena, TX 76655` is 0.7 miles from a 1.50 inch report.
3. Run the workflow by hand. Replay skips warnings and does not remember who was named, so every run texts.
4. Clear `replay_spc_day` and publish.

On n8n 2.x a change to a published workflow does not reach the running copy until you publish again.

## Tests

- [`tests/weather.test.js`](tests/weather.test.js) runs the Code node source straight out of the workflow file with the clock frozen, using report lines copied from real Storm Prediction Center files: 49 checks covering settings, the customer list, address results (including a Weather Service answer that arrives as text), storm day times across midnight UTC, size and distance limits, wind damage reports, naming each customer once per storm day, warnings by zone, expired and test warnings, quiet hours, retries, the outreach handoff and its fallback, a source that stops answering, and that the file ships with no credentials. `cd tests && npm install && node weather.test.js`. CI runs it on every push.
- [`docs/VERIFIED-RESULTS.md`](docs/VERIFIED-RESULTS.md) has the live runs in a real n8n with a real Twilio number.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) explains the design choices.

## Limits

- **Storm reports are points, not paths.** A report says hail of a given size fell at one place. A customer 2 miles away may have had none, or worse. Treat a match as a reason to check, not proof of damage. Paid trackers add radar-based hail swaths, which this does not have.
- **Reports are preliminary.** The Storm Prediction Center files are filled in during and after a storm, and some reports arrive hours later. Late reports are still matched on the next check.
- **Warnings are matched by zone and county.** A county-wide Flood Warning covers every customer in that county, even those on high ground.
- **Memory needs a published workflow.** Addresses and who has been named live in n8n's workflow static data, which n8n keeps only for published workflows. Runs started with the Execute button look addresses up again each time.
- **US only.** The Census geocoder and the Weather Service cover the United States.
- **Subaccounts.** It uses the first active account the Twilio credential returns.

## License

MIT. Use it, change it, sell it.

Built by [Mike Matthews](https://github.com/mikematthewsai). More standalone workflows and the full lead-response system: [n8n-lead-response](https://github.com/mikematthewsai/n8n-lead-response).
