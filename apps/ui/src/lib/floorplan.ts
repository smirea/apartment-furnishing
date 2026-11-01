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

export type Fixture = { rect: Rect; height: number; color: number; y?: number; solid?: boolean };

// Leaf drawn in its open position, hinge first, as the swing arcs on the plan show.
export type Door = [hingeX: number, hingeY: number, endX: number, endY: number];

export type Column = { x: number; y: number; r: number };

export const rooms: Room[] = [
	{ name: 'Bedroom', floor: 'wood', rect: [48, 35, 388, 285], size: `13'3" x 10'0"` },
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
	{ name: 'Office / guest', floor: 'wood', rect: [583, 648, 850, 905], size: `10'8" x 10'2"` },
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
	{ rect: [400, 45, 430, 95], height: 7, color: 0xc9a77c },
	{ rect: [470, 55, 500, 85], height: 0.3, y: 3, color: 0xffffff },
	{ rect: [535, 55, 565, 85], height: 0.3, y: 3, color: 0xffffff },
	{ rect: [605, 45, 640, 70], height: 2.6, color: 0xffffff },
	{ rect: [608, 70, 637, 105], height: 1.4, color: 0xffffff },
	{ rect: [663, 60, 667, 180], height: 7, color: 0x9fd0e8, solid: true },
	{ rect: [665, 45, 735, 60], height: 0.4, y: 6.5, color: 0xb0b0b0 },
	{ rect: [298, 315, 348, 340], height: 0.1, y: 3, color: 0x222222 },
	{ rect: [205, 395, 245, 450], height: 0.05, y: 3, color: 0x111111 },
	{ rect: [340, 452, 372, 470], height: 0.6, y: 1.5, color: 0x333333 },
	{ rect: [345, 530, 370, 545], height: 2.5, color: 0x333333 },
	{ rect: [385, 530, 410, 545], height: 2.5, color: 0x333333 },
	{ rect: [435, 530, 460, 545], height: 2.5, color: 0x333333 },
	{ rect: [660, 403, 690, 420], height: 0.3, y: 3, color: 0xffffff },
	{ rect: [725, 390, 755, 410], height: 2.6, color: 0xffffff },
	{ rect: [728, 410, 752, 445], height: 1.4, color: 0xffffff },
	{ rect: [780, 390, 835, 425], height: 7, color: 0xc9a77c },
	{ rect: [590, 300, 635, 380], height: 7, color: 0xd8c8a8 },
	{ rect: [55, 300, 185, 305], height: 0.15, y: 5.5, color: 0xd8c8a8 },
	{ rect: [70, 450, 165, 490], height: 0.15, y: 5.5, color: 0xd8c8a8 },
	{ rect: [700, 600, 840, 605], height: 0.15, y: 5.5, color: 0xd8c8a8 },
	{ rect: [650, 300, 705, 380], height: 0.15, y: 5.5, color: 0xd8c8a8 },
];

export const doors: Door[] = [
	[392, 105, 468, 105],
	[392, 205, 468, 205],
	[150, 287, 150, 365],
	[180, 540, 100, 540],
	[585, 480, 657, 480],
	[595, 650, 595, 722],
	[700, 648, 700, 720],
	[760, 137, 815, 192],
	[865, 205, 812, 190],
	[620, 180, 665, 135],
];

// The filled circle in the living room is a structural column (visible in living-room-island-corner-windows.jpg).
export const columns: Column[] = [{ x: 308, y: 860, r: 27 }];

export const footprint: Rect = [40, 25, 910, 925];

export const ft = (px: number) => px / PX_PER_FT;
