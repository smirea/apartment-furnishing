// All coordinates are pixels traced from listing/photos/unit/floorplan-b4.jpg
// (cropped 150,190 and doubled). The scale is a least-squares fit of ten tape-measured spans
// (2026-11-02) against the trace; the builder's stated room sizes gave 24.8 and drew the unit ~4.5% small.
// Measured rooms (primary bedroom, living room, office, island, column) were then nudged to the tape.
export const PX_PER_FT = 23.7;
export const CEILING_FT = 10;

export type Rect = [x1: number, y1: number, x2: number, y2: number];
export type Gap = [from: number, to: number];
export type FloorKind = 'wood' | 'tile' | 'concrete';

export type Wall = {
	line: Rect;
	thickness?: number;
	gaps?: Gap[];
	glass?: boolean;
	height?: number;
};

export type Room = { name: string; floor: FloorKind; rect: Rect; size?: string };

export type Fixture = { rect: Rect; height: number; color: number; y?: number; solid?: boolean };

// Leaf drawn in its open position, hinge first, as the swing arcs on the plan show.
export type Door = [hingeX: number, hingeY: number, endX: number, endY: number];

export type Column = { x: number; y: number; r: number };

export const rooms: Room[] = [
	{ name: 'Bedroom', floor: 'wood', rect: [48, 35, 383, 291], size: `13'6" x 10'2"` },
	{ name: 'Primary closet', floor: 'wood', rect: [48, 291, 190, 490] },
	{ name: 'Bath 1', floor: 'tile', rect: [383, 35, 740, 193] },
	{ name: 'Mech.', floor: 'concrete', rect: [745, 35, 905, 135] },
	{ name: 'Entry', floor: 'wood', rect: [383, 193, 865, 290] },
	{ name: 'Entry', floor: 'wood', rect: [740, 135, 865, 193] },
	{ name: 'Kitchen', floor: 'wood', rect: [195, 290, 583, 520], size: `11'7" x 7'10"` },
	{ name: 'Living room', floor: 'wood', rect: [183, 520, 588, 905], size: `16'7" x 17'0"` },
	{ name: '', floor: 'wood', rect: [583, 548, 690, 641] },
	{ name: 'Laundry / pantry', floor: 'tile', rect: [583, 290, 854, 385] },
	{ name: 'Bath 2', floor: 'tile', rect: [583, 385, 854, 548] },
	{ name: 'Closet 2', floor: 'wood', rect: [690, 555, 854, 641] },
	{ name: 'Office / guest', floor: 'wood', rect: [583, 641, 854, 905], size: `11'0" x 10'5"` },
	{ name: 'Balcony', floor: 'concrete', rect: [55, 495, 180, 900], size: `5'1" x 17'2"` },
];

export const walls: Wall[] = [
	{ line: [40, 35, 910, 35], thickness: 20 },
	{ line: [48, 35, 48, 158], thickness: 20 },
	{ line: [48, 158, 48, 256], glass: true },
	{ line: [48, 256, 48, 490], thickness: 20 },
	{ line: [910, 35, 910, 135], thickness: 20 },

	{
		line: [383, 35, 383, 296],
		gaps: [
			[110, 187],
			[199, 274],
		],
	},
	{ line: [383, 193, 740, 193] },
	{ line: [740, 35, 740, 135] },
	{ line: [745, 135, 905, 135], gaps: [[760, 830]] },

	{ line: [48, 291, 190, 291], gaps: [[70, 135]] },
	{ line: [190, 291, 190, 495], thickness: 14 },
	{ line: [190, 296, 490, 296], thickness: 20 },
	{ line: [490, 296, 490, 350], thickness: 20 },
	{ line: [195, 495, 250, 495], thickness: 14 },

	{ line: [865, 135, 865, 340], gaps: [[145, 205]] },
	{ line: [859, 340, 859, 925], thickness: 20 },

	{
		line: [583, 290, 859, 290],
		gaps: [
			[592, 632],
			[645, 700],
			[715, 835],
		],
	},
	{ line: [583, 385, 859, 385] },
	{ line: [640, 290, 640, 385] },
	{ line: [710, 290, 710, 385] },
	{ line: [583, 290, 583, 560], thickness: 20, gaps: [[480, 550]] },
	{ line: [665, 548, 859, 548] },
	{ line: [690, 548, 690, 641] },
	{
		line: [583, 641, 859, 641],
		gaps: [
			[592, 663],
			[707, 778],
		],
	},
	{ line: [583, 641, 583, 925] },

	{ line: [180, 495, 180, 905], glass: true, gaps: [[540, 620]] },
	{ line: [180, 905, 469, 905], glass: true },
	{ line: [469, 905, 732, 905], thickness: 24 },
	{ line: [732, 905, 827, 905], glass: true },
	{ line: [827, 905, 864, 905], thickness: 24 },

	{ line: [55, 495, 55, 900], glass: true, height: 3.5 },
	{ line: [55, 495, 180, 495], glass: true, height: 3.5 },
	{ line: [55, 898, 180, 898], glass: true, height: 3.5 },
];

export const fixtures: Fixture[] = [
	{ rect: [195, 301, 410, 346], height: 3, color: 0xc9a77c },
	{ rect: [200, 346, 250, 495], height: 3, color: 0xc9a77c },
	{ rect: [405, 306, 475, 371], height: 6, color: 0xb8bcc0 },
	{ rect: [335, 438, 475, 519], height: 3, color: 0xe8e4dc },
	{ rect: [435, 40, 585, 100], height: 3, color: 0xc9a77c },
	{ rect: [665, 60, 735, 180], height: 0.1, color: 0xd8e4e8 },
	{ rect: [650, 400, 710, 425], height: 3, color: 0xc9a77c },
	{ rect: [780, 430, 835, 545], height: 1.6, color: 0xf2f2f2 },
	{ rect: [715, 300, 770, 375], height: 3, color: 0xdcdcdc },
	{ rect: [775, 300, 830, 375], height: 3, color: 0xdcdcdc },
	{ rect: [395, 45, 425, 95], height: 7, color: 0xc9a77c },
	{ rect: [470, 55, 500, 85], height: 0.3, y: 3, color: 0xffffff },
	{ rect: [535, 55, 565, 85], height: 0.3, y: 3, color: 0xffffff },
	{ rect: [605, 45, 640, 70], height: 2.6, color: 0xffffff },
	{ rect: [608, 70, 637, 105], height: 1.4, color: 0xffffff },
	{ rect: [663, 60, 667, 180], height: 7, color: 0x9fd0e8, solid: true },
	{ rect: [665, 45, 735, 60], height: 0.4, y: 6.5, color: 0xb0b0b0 },
	{ rect: [298, 321, 348, 346], height: 0.1, y: 3, color: 0x222222 },
	{ rect: [205, 395, 245, 450], height: 0.05, y: 3, color: 0x111111 },
	{ rect: [340, 441, 372, 459], height: 0.6, y: 1.5, color: 0x333333 },
	{ rect: [345, 519, 370, 534], height: 2.5, color: 0x333333 },
	{ rect: [385, 519, 410, 534], height: 2.5, color: 0x333333 },
	{ rect: [435, 519, 460, 534], height: 2.5, color: 0x333333 },
	{ rect: [660, 403, 690, 420], height: 0.3, y: 3, color: 0xffffff },
	{ rect: [725, 390, 755, 410], height: 2.6, color: 0xffffff },
	{ rect: [728, 410, 752, 445], height: 1.4, color: 0xffffff },
	{ rect: [780, 390, 835, 425], height: 7, color: 0xc9a77c },
	{ rect: [590, 300, 635, 380], height: 7, color: 0xd8c8a8 },
	{ rect: [55, 306, 185, 311], height: 0.15, y: 5.5, color: 0xd8c8a8 },
	{ rect: [70, 450, 165, 490], height: 0.15, y: 5.5, color: 0xd8c8a8 },
	{ rect: [700, 600, 840, 605], height: 0.15, y: 5.5, color: 0xd8c8a8 },
	{ rect: [650, 300, 705, 380], height: 0.15, y: 5.5, color: 0xd8c8a8 },
	// Living-room TV wall: switch, data jack + outlet, smoke alarm (taped elevation)
	{ rect: [576, 665, 578, 671], height: 0.375, y: 3.75, color: 0xffffff },
	{ rect: [576, 755, 578, 769], height: 0.375, y: 1.15, color: 0xffffff },
	{ rect: [575, 701, 578, 712], height: 0.15, y: 8.75, color: 0xf4f4f4 },
];

export const doors: Door[] = [
	[387, 114, 463, 114],
	[387, 203, 463, 203],
	[75, 293, 75, 358],
	[180, 540, 100, 540],
	[585, 480, 657, 480],
	[594, 643, 594, 714],
	[776, 643, 776, 714],
	[760, 137, 815, 192],
	[865, 205, 812, 190],
	[620, 180, 665, 135],
];

// The filled circle in the living room is a structural column (visible in living-room-island-corner-windows.jpg).
export const columns: Column[] = [{ x: 307, y: 865, r: 33 }];

export const footprint: Rect = [40, 25, 910, 925];

export const ft = (px: number) => px / PX_PER_FT;
