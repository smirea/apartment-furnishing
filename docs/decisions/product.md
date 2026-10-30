# Product goals

- **Purpose.** Help furnish one apartment: 84 East Ave #2209, Austin (The Vesper, plan B4). The README holds the listing facts and the photo index.
- **Listing assets are committed.** The listing photos live in `listing/photos/{unit,building}` with descriptive kebab-case names, so furnishing decisions can be checked against the real space.
- **Zillow blocks scripted fetches.** Plain `curl` and fetch tools get a 403/captcha. Page data and photo URLs come from the page's `__NEXT_DATA__` in a real browser session; the photo CDN (`photos.zillowstatic.com`) downloads fine with `curl`.
- **Still to decide.** What the app itself does and the quality bar, once the first feature lands.
