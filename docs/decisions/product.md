# Product goals

- **Purpose.** Help furnish one apartment (floor plan B4). The address stays out of the repo. The README holds the listing facts and the photo index.
- **Listing assets are committed.** The listing photos live in `listing/photos/{unit,building}` with descriptive kebab-case names, so furnishing decisions can be checked against the real space.
- **Zillow blocks scripted fetches.** Plain `curl` and fetch tools get a 403/captcha. Page data and photo URLs come from the page's `__NEXT_DATA__` in a real browser session; the photo CDN (`photos.zillowstatic.com`) downloads fine with `curl`.
- **Layouts.** The apartment can be arranged several ways side by side. A layout owns its placements, fixture picks, TV, carpets on the floor, and the products deleted from it; imported products belong to every layout. Deleting a product from one layout deletes it for good only when no other layout has it in the room. The AR app shows the layout last picked on the web.
- **Still to decide.** What the app itself does and the quality bar, once the first feature lands.
