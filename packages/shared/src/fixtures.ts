// Fixtures are the built-in spots of the apartment (the TV, the bed, the living-room wall texture): each holds one of
// several imported candidates, and every client switches between them through /api/fixtures the same way.
import type { Job, TvSettings } from './items';

// Where an item fixture stands, in plan feet: the middle of the wall face its back sits flush against. `yaw` turns the
// model like Placement.rotation[1] (0 faces south, 90 east), and `span` is the face's length, for the room to the sides.
export type WallSpot = { x: number; z: number; yaw: 0 | 90 | 180 | -90; span: number };

export type FixtureSpec = {
	title: string;
	// Plan room name; the AR app shows a fixture only in its room.
	room: string;
	importLabel: string;
} & (
	| { kind: 'tv' }
	| { kind: 'wallTexture' }
	// A catalog item of `category`, standing at `spot` instead of being placed by hand.
	| { kind: 'item'; category: string; spot: WallSpot }
);

// In panel order.
export const FIXTURE_KEYS = ['wallTexture', 'tv', 'bed'] as const;
export type FixtureKey = (typeof FIXTURE_KEYS)[number];

export type FixtureOption = {
	id: string;
	name: string;
	url: string;
	image: string | null;
	// One line of facts under the name, the same in every client.
	detail: string;
	// Shown in red, like a bed that leaves too little room for a nightstand.
	warning: string | null;
	group: string | null;
	// A model or texture build for this option, while it runs or after it failed.
	job: Job | null;
	// Only ready options can be selected; a wall texture isn't until its tile is built.
	ready: boolean;
};

export type Fixture = FixtureSpec & {
	key: FixtureKey;
	selected: string | null;
	removable: boolean;
	options: FixtureOption[];
	// The TV's mount and size, which the web plan also edits by hand.
	tv?: TvSettings;
};
