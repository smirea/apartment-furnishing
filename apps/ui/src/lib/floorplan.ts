// All coordinates are pixels traced from listing/photos/unit/floorplan-b4.jpg
// (cropped 150,190 and doubled). The plan's stated room sizes give ~24.8 px per foot.
export const PX_PER_FT = 24.8;
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

export type Fixture = { rect: Rect; height: number; color: number };

export const rooms: Room[] = [
	{ name: 'Bedroom 1', floor: 'wood', rect: [48, 35, 388, 285], size: `13'3" x 10'0"` },
	{ name: 'Primary closet', floor: 'wood', rect: [48, 285, 190, 490] },
	{ name: 'Bath 1', floor: 'tile', rect: [388, 35, 740, 188] },
	{ name: 'Mech.', floor: 'concrete', rect: [745, 35, 905, 135] },
	{ name: 'Entry', floor: 'wood', rect: [388, 188, 865, 290] },
	{ name: 'Entry', floor: 'wood', rect: [740, 135, 865, 188] },
	{ name: 'Kitchen', floor: 'wood', rect: [195, 290, 583, 520], size: `11'7" x 7'10"` },
	{ name: 'Living room', floor: 'wood', rect: [183, 520, 583, 905], size: `16'5" x 15'6"` },
	{ name: '', floor: 'wood', rect: [583, 548, 690, 648] },
	{ name: 'Laundry / pantry', floor: 'tile', rect: [583, 290, 850, 385] },
	{ name: 'Bath 2', floor: 'tile', rect: [583, 385, 850, 548] },
	{ name: 'Closet 2', floor: 'wood', rect: [690, 555, 850, 648] },
	{ name: 'Bedroom 2', floor: 'wood', rect: [583, 648, 850, 905], size: `10'8" x 10'2"` },
	{ name: 'Balcony', floor: 'concrete', rect: [55, 495, 180, 900], size: `5'1" x 17'2"` },
];

export const walls: Wall[] = [
	{ line: [40, 35, 910, 35], thickness: 20 },
	{ line: [48, 35, 48, 150], thickness: 20 },
	{ line: [48, 150, 48, 255], glass: true },
	{ line: [48, 255, 48, 490], thickness: 20 },
	{ line: [910, 35, 910, 135], thickness: 20 },

	{
		line: [388, 35, 388, 285],
		gaps: [
			[100, 180],
			[205, 275],
		],
	},
	{ line: [388, 188, 740, 188] },
	{ line: [740, 35, 740, 135] },
	{ line: [745, 135, 905, 135], gaps: [[760, 830]] },

	{ line: [48, 285, 190, 285], gaps: [[70, 150]] },
	{ line: [190, 285, 190, 495], thickness: 14 },
	{ line: [190, 290, 490, 290], thickness: 20 },
	{ line: [490, 290, 490, 350], thickness: 20 },
	{ line: [195, 495, 250, 495], thickness: 14 },

	{ line: [865, 135, 865, 340], gaps: [[145, 205]] },
	{ line: [855, 340, 855, 925], thickness: 20 },

	{
		line: [583, 290, 850, 290],
		gaps: [
			[592, 632],
			[645, 700],
			[715, 835],
		],
	},
	{ line: [583, 385, 850, 385] },
	{ line: [640, 290, 640, 385] },
	{ line: [710, 290, 710, 385] },
	{ line: [583, 290, 583, 560], thickness: 20, gaps: [[480, 550]] },
	{ line: [665, 548, 855, 548] },
	{ line: [690, 548, 690, 648] },
	{
		line: [583, 648, 850, 648],
		gaps: [
			[595, 660],
			[700, 780],
		],
	},
	{ line: [583, 648, 583, 925], thickness: 20 },

	{ line: [180, 495, 180, 905], glass: true, gaps: [[540, 620]] },
	{ line: [180, 905, 483, 905], glass: true },
	{ line: [483, 905, 583, 905], thickness: 24 },
	{ line: [583, 905, 822, 905], glass: true },
	{ line: [822, 905, 860, 905], thickness: 24 },

	{ line: [55, 495, 55, 900], glass: true, height: 3.5 },
	{ line: [55, 495, 180, 495], glass: true, height: 3.5 },
	{ line: [55, 898, 180, 898], glass: true, height: 3.5 },
];

export const fixtures: Fixture[] = [
	{ rect: [195, 295, 410, 340], height: 3, color: 0xc9a77c },
	{ rect: [200, 340, 250, 495], height: 3, color: 0xc9a77c },
	{ rect: [405, 300, 475, 365], height: 6, color: 0xb8bcc0 },
	{ rect: [335, 445, 475, 530], height: 3, color: 0xe8e4dc },
	{ rect: [435, 40, 585, 100], height: 3, color: 0xc9a77c },
	{ rect: [665, 60, 735, 180], height: 0.1, color: 0xd8e4e8 },
	{ rect: [650, 400, 710, 425], height: 3, color: 0xc9a77c },
	{ rect: [780, 430, 835, 545], height: 1.6, color: 0xf2f2f2 },
	{ rect: [715, 300, 770, 375], height: 3, color: 0xdcdcdc },
	{ rect: [775, 300, 830, 375], height: 3, color: 0xdcdcdc },
];

export const footprint: Rect = [40, 25, 910, 925];

export const ft = (px: number) => px / PX_PER_FT;
